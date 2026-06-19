import json
from collections.abc import Callable

from pydantic import ValidationError

from app.ai.client import ExtractedCandidate, Suggestion


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


class GeminiExtractor:
    def __init__(self, api_key, extract_model, suggest_model, transport: Callable | None = None):
        self.extract_model = extract_model
        self.suggest_model = suggest_model
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
