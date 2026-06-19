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


class GeminiClient(Protocol):
    def extract(self, text: str, theme: str, pool: list[str]) -> list[ExtractedCandidate]: ...
    def suggest(self, theme: str, pool: list[str]) -> list[Suggestion]: ...
