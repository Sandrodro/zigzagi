import json
from collections.abc import Callable
import logging

from pydantic import ValidationError

from app.ai.client import ClueResult, ExtractedCandidate, Suggestion, ThemeAndClues, WordCheck


class AIError(Exception):
    pass


def _default_transport(api_key: str):  # pragma: no cover - real network
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    def call(model: str, prompt: str, schema, think=True):
        cfg = types.GenerateContentConfig(response_mime_type="application/json")
        if not think:
            # ponytail: lemmatize/extract need no reasoning; with thinking on, the
            # model burned the whole token budget and truncated the JSON (MAX_TOKENS).
            cfg.thinking_config = types.ThinkingConfig(thinking_budget=0)
            cfg.max_output_tokens = 16384
        return client.models.generate_content(model=model, contents=prompt, config=cfg)

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


_THEME_CLUE_PROMPT = """\
Act as a master crossword constructor and editor in the tradition of a Monday New \
York Times puzzle — but native to Georgian language and culture. You are the Georgian \
equivalent of a seasoned puzzle editor: fluent in standard literary Georgian, steeped \
in everyday Georgian culture (geography, food, history, proverbs, pop references, \
everyday objects), and obsessed with fairness. Your craft is the straight clue: \
getting a solver to the answer through clean, confident definition, not through \
trickery. You think of the solver as a bright, ordinary person on a Monday morning who \
wants to feel smart, not stumped — and who enjoys a clue that makes them smile.

Objective
You are given a JSON list of crossword answers (each item has an "entry_id" and its \
"answer"). Do two things. First, read the entire list and synthesize a single unifying \
theme — a topical or conceptual thread that honestly connects the words (or the \
strongest honest connector available). Second, write exactly one clue per answer. The \
whole set must read like a polished, accessible Monday puzzle: easy, gettable, quietly \
satisfying, thematically cohesive, and with a light touch of personality.

Clue Style and Difficulty
Difficulty Target — Monday: This is the easiest day of the week. Clues are direct, \
definitional, and rooted in common knowledge. The answer must always feel like a \
gimme. NO anagrams, hidden-word clues, or heavy misdirection. NO "?"-style trick clues \
that deliberately mislead about what's being asked. If a clue makes the solver work to \
decode the clue itself, it's too hard for Monday.
Wit Is Welcome (within Monday limits): Clues can be witty, warm, dry, or gently punny — \
just not tricky. A pun is fine as long as the answer stays obvious. The humor is a \
bonus the solver enjoys after they've already gotten the answer, never an obstacle. If \
a joke risks ambiguity, drop it and clue straight. Fairness always beats funny.
Cluing Variety: Across the set, rotate among clean clue types: straight \
synonym/definition; category-or-example; fill-in-the-blank of a well-known phrase, \
place name, proverb, or title; a sprinkling of light, affectionate humor; and \
universally-known cultural or factual references. Lean heavily on definition and \
fill-in-the-blank — the Monday workhorses — and let wit season the set.
Fairness Principle: Every clue must point to exactly one answer. No obscure trivia, no \
inside knowledge, no ambiguity. Keep clues short — ideally under ~8 words.

Linguistic and Lexical Rules
Language Base: Write all clues in clear, standard literary Georgian. Avoid heavy slang, \
dialect, or archaisms. A wink of colloquial warmth is fine; opacity is not.
Grammatical Agreement: Match the clue to the grammatical form of the answer. Default to \
nominative singular unless the answer is an inflected or plural form, in which case \
mirror it. The clue's implied part of speech must match the answer.
Proper-Noun Signaling: Georgian has no capital letters, so signal names through the \
clue itself — lead with the category ("ქალაქი...", "მდინარე...", "მწერალი...") so the \
solver knows they're after a name. For abbreviations add "(შემოკლებით)".
Anti-Give-Away Rule (strict): Never use the answer word, its root, an obvious cognate, \
OR any word that contains the answer as a substring inside its own clue. For მზე, do \
not write "მზიანი ამინდი" (მზიანი contains მზე). Enforce this on every single clue, \
jokes included.
Natural Phrasing: Avoid unnatural or contrived combination/compound words (e.g. \
წყალმცურავი). Prefer the natural, everyday word or phrase a fluent speaker would \
actually use.

Thematic Guidelines
Theme Synthesis: Find the strongest honest thread running through the answers — a \
semantic field, a cultural domain, or a shared property. Do not force a connection \
that isn't there; if the words are genuinely disparate, label it a general-knowledge \
Monday ("თემატური ბადის გარეშე").
Emphasize the Theme: Where natural, frame clues from inside the theme's world so the \
solver feels the unifying thread. Guardrail: this is a tonal lean, never a mandate — \
never bend a clue toward the theme if doing so makes the answer harder, introduces \
ambiguity, or violates Monday ease. If a theme-flavored framing and a plain framing \
compete, choose plain. Cohesion serves the solver; it never taxes them.

Output
Return ONLY a JSON object, no preamble, in exactly this shape:
{{"theme": "<short Georgian theme label>", "clues": [{{"entry_id": "<id>", "clue": "<Georgian clue>"}}]}}
Include exactly one clue object per input entry, reusing each entry's "entry_id" \
verbatim. "theme" is a short Georgian label only (it becomes the puzzle title).

Answers:
{batch}"""


class GeminiExtractor:
    def __init__(
        self,
        api_key,
        dumb_model,
        smart_model,
        clue_model=None,
        transport: Callable | None = None,
    ):
        self.dumb_model = dumb_model
        self.smart_model = smart_model
        self.clue_model = clue_model
        self._call = transport or _default_transport(api_key)

    def _parse(self, text: str, model_cls):
        return [model_cls(**row) for row in json.loads(text)]

    def extract(self, text, theme, pool) -> list[ExtractedCandidate]:
        prompt = _EXTRACT_PROMPT.format(theme=theme, pool=", ".join(pool), text=text)
        for attempt in range(2):  # one bounded retry
            resp = self._call(self.dumb_model, prompt, ExtractedCandidate, think=False)
            try:
                return self._parse(resp.text, ExtractedCandidate)
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("extraction returned malformed JSON")
        raise AIError("unreachable")

    def suggest(self, theme, pool) -> list[Suggestion]:
        prompt = f"შემოგვთავაზე ქართული სიტყვები თემაზე '{theme}'. პული: {', '.join(pool)}. JSON სია (word, reason, in_corpus)."
        for attempt in range(2):
            resp = self._call(self.smart_model, prompt, Suggestion)
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

    def theme_and_clues(self, batch) -> ThemeAndClues:
        prompt = _THEME_CLUE_PROMPT.format(batch=[r.model_dump() for r in batch])
        for attempt in range(2):  # one bounded retry
            resp = self._call(self.smart_model, prompt, ThemeAndClues)
            try:
                return ThemeAndClues(**json.loads(resp.text))
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("theme/clue generation returned malformed JSON")
        raise AIError("unreachable")

    def lemmatize(self, words, cheap=False) -> list[str]:
        # ponytail: one call for the whole article; chunk if a paste ever blows the token limit.
        # cheap=True uses the flash extract model instead of the pricier suggest model.
        prompt = (
            "For each Georgian word below, return its lemma (ლექსიკონური ძირითადი ფორმა). "
            "For an adjective derived from a noun, return the noun's lemma instead "
            "(e.g. 'ემიგრაციული' -> 'ემიგრაცია', 'სოცრეალისტური' -> 'სოცრეალიზმი'). "
            "For a word in a non-nominative case or any inflected form, return its "
            "nominative/base dictionary form (e.g. 'განედიდებინა' -> 'განდიდება'). "
            "Skip any token that is not a valid Georgian word or has no lemma. "
            "Return only a JSON array of unique lemmas (strings). "
            f"Words: {', '.join(words)}"
        )
        model = self.dumb_model if cheap else self.smart_model
        for attempt in range(2):
            resp = self._call(model, prompt, None, think=False)
            logging.info(resp)
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
            resp = self._call(self.smart_model, prompt, WordCheck)
            logging.info("%s", resp.text)
            try:
                return WordCheck(**json.loads(resp.text))
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("word check returned malformed JSON")
        raise AIError("unreachable")
