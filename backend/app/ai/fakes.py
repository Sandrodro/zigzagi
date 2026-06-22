from app.ai.client import ClueResult, ExtractedCandidate, Suggestion


class FakeGeminiClient:
    def __init__(self, extract_return=None, suggest_return=None, clue_return=None):
        self._extract = extract_return or []
        self._suggest = suggest_return or []
        self._clue = clue_return or []

    def extract(self, text, theme, pool) -> list[ExtractedCandidate]:
        return list(self._extract)

    def suggest(self, theme, pool) -> list[Suggestion]:
        return list(self._suggest)

    def clue(self, batch) -> list[ClueResult]:
        return list(self._clue)
