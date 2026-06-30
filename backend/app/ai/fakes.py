from app.ai.client import ClueResult, ExtractedCandidate, Suggestion


class FakeGeminiClient:
    def __init__(self, extract_return=None, suggest_return=None, clue_return=None, lemmatize_return=None):
        self._extract = extract_return or []
        self._suggest = suggest_return or []
        self._clue = clue_return or []
        self._lemmatize = lemmatize_return or []

    def extract(self, text, pool) -> list[ExtractedCandidate]:
        return list(self._extract)

    def suggest(self, pool) -> list[Suggestion]:
        return list(self._suggest)

    def clue(self, batch) -> list[ClueResult]:
        return list(self._clue)

    def lemmatize(self, words, cheap=False) -> list[str]:
        return list(self._lemmatize)
