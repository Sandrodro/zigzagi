from app.ai.client import ExtractedCandidate, Suggestion


class FakeGeminiClient:
    def __init__(self, extract_return=None, suggest_return=None):
        self._extract = extract_return or []
        self._suggest = suggest_return or []

    def extract(self, text, theme, pool) -> list[ExtractedCandidate]:
        return list(self._extract)

    def suggest(self, theme, pool) -> list[Suggestion]:
        return list(self._suggest)
