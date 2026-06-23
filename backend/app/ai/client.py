from typing import Protocol

from pydantic import BaseModel


class ExtractedCandidate(BaseModel):
    surface: str
    lemma: str
    length: int
    snippet: str
    theme_relevance: float


class Suggestion(BaseModel):
    word: str
    reason: str
    in_corpus: bool


class ClueRequest(BaseModel):
    entry_id: str
    answer: str
    direction: str
    number: int
    theme: str
    source_snippet: str | None = None


class ClueResult(BaseModel):
    entry_id: str
    clue: str


class WordCheck(BaseModel):
    valid: bool
    replacement: str | None = None


class GeminiClient(Protocol):
    def extract(self, text: str, theme: str, pool: list[str]) -> list[ExtractedCandidate]: ...
    def suggest(self, theme: str, pool: list[str]) -> list[Suggestion]: ...
    def clue(self, batch: list[ClueRequest]) -> list[ClueResult]: ...
    def check_word(self, word: str, pattern: str, length: int) -> WordCheck: ...
