import json
from collections.abc import Callable
import logging

from pydantic import ValidationError

from app.ai.client import ClueResult, ExtractedCandidate, Suggestion, WordCheck


class AIError(Exception):
    pass


def _default_transport(api_key: str):  # pragma: no cover - real network
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    def call(model: str, prompt: str, schema):
        return client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )

    return call


_EXTRACT_PROMPT = (
    "ამოიღე ქართული სიტყვები შემდეგი ტექსტიდან თემაზე '{theme}'. "
    "დააბრუნე JSON სია ობიექტებით (surface, lemma, length, snippet, theme_relevance). "
    "არსებული პული: {pool}. ტექსტი:\n{text}"
)


_CLUE_PROMPT = (
    "დაწერე ქართული მინიშნებები შემდეგი სიტყვებისთვის NYT-Monday სტილში "
    "(პირდაპირი, განმარტებითი, მინიმალური სიტყვების თამაში). "
    "დააბრუნე JSON სია ობიექტებით (entry_id, clue). ჩანაწერები: {batch}"
)


class GeminiExtractor:
    def __init__(
        self,
        api_key,
        extract_model,
        suggest_model,
        clue_model=None,
        transport: Callable | None = None,
    ):
        self.extract_model = extract_model
        self.suggest_model = suggest_model
        self.clue_model = clue_model
        self._call = transport or _default_transport(api_key)

    def _parse(self, text: str, model_cls):
        return [model_cls(**row) for row in json.loads(text)]

    def extract(self, text, theme, pool) -> list[ExtractedCandidate]:
        prompt = _EXTRACT_PROMPT.format(theme=theme, pool=", ".join(pool), text=text)
        for attempt in range(2):  # one bounded retry
            resp = self._call(self.extract_model, prompt, ExtractedCandidate)
            try:
                return self._parse(resp.text, ExtractedCandidate)
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("extraction returned malformed JSON")
        raise AIError("unreachable")

    def suggest(self, theme, pool) -> list[Suggestion]:
        prompt = f"შემოგვთავაზე ქართული სიტყვები თემაზე '{theme}'. პული: {', '.join(pool)}. JSON სია (word, reason, in_corpus)."
        for attempt in range(2):
            resp = self._call(self.suggest_model, prompt, Suggestion)
            try:
                return self._parse(resp.text, Suggestion)
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("suggestion returned malformed JSON")
        raise AIError("unreachable")

    def clue(self, batch) -> list[ClueResult]:
        prompt = _CLUE_PROMPT.format(batch=[r.model_dump() for r in batch])
        for attempt in range(2):  # one bounded retry
            resp = self._call(self.clue_model, prompt, ClueResult)
            try:
                return self._parse(resp.text, ClueResult)
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("clue generation returned malformed JSON")
        raise AIError("unreachable")

    def lemmatize(self, words, cheap=False) -> list[str]:
        # ponytail: one call for the whole article; chunk if a paste ever blows the token limit.
        # cheap=True uses the flash extract model instead of the pricier suggest model.
        prompt = (
            "For each Georgian word below, return its lemma (ლექსიკონური ძირითადი ფორმა). "
            "For words that are nouns turned into adjectives (e.g. 'ემიგრაციული'), "
            "return the lemma of the noun itself ('ემიგრაცია'). "
            "Skip any token that is not a valid Georgian word or has no lemma. "
            "Return only a JSON array of unique lemmas (strings). "
            f"Words: {', '.join(words)}"
        )
        model = self.extract_model if cheap else self.suggest_model
        for attempt in range(2):
            resp = self._call(model, prompt, None)
            try:
                return [str(x) for x in json.loads(resp.text)]
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("lemmatize returned malformed JSON")
        raise AIError("unreachable")

    def check_word(self, word, pattern, length) -> WordCheck:
        prompt = (
            f"შეამოწმე, არის თუ არა '{word}' გამართული ქართული სიტყვა. "
            f"თუ არ არის, შემოგვთავაზე {length}-ასოიანი გამართული ქართული სიტყვა, "
            f"რომელიც ზუსტად შეესაბამება შაბლონს '{pattern}' "
            f"(სადაც '_' ნებისმიერი ასოა, დანარჩენი ასოები უცვლელია). "
            f'დააბრუნე მხოლოდ JSON ობიექტი: {{"valid": true|false, "replacement": "სიტყვა"|null}}.'
        )
        for attempt in range(2):
            logging.info(prompt)
            resp = self._call(self.suggest_model, prompt, WordCheck)
            logging.info("%s", resp.text)
            try:
                return WordCheck(**json.loads(resp.text))
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("word check returned malformed JSON")
        raise AIError("unreachable")
