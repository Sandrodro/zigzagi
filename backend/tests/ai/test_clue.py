import pytest

from app.ai.client import ClueRequest, ClueResult
from app.ai.fakes import FakeGeminiClient
from app.ai.gemini import AIError, GeminiExtractor


def test_fake_returns_canned_clues():
    fake = FakeGeminiClient(clue_return=[ClueResult(entry_id="e1", clue="საქართველოს დედაქალაქი")])
    out = fake.clue([ClueRequest(entry_id="e1", answer="თბილისი", direction="across", number=1, theme="თბილისი", source_snippet=None)])
    assert out[0].clue == "საქართველოს დედაქალაქი"


def test_real_clue_parses_and_uses_smart_model():
    seen = []

    class _Resp:
        text = '[{"entry_id":"e1","clue":"საქართველოს დედაქალაქი"}]'

    def transport(model, prompt, schema):
        seen.append(model)
        return _Resp()

    ex = GeminiExtractor(api_key="x", dumb_model="f", smart_model="m-pro", transport=transport)
    out = ex.clue([ClueRequest(entry_id="e1", answer="თბილისი", direction="across", number=1, theme="თ", source_snippet=None)])
    assert out[0].entry_id == "e1" and seen == ["m-pro"]


def test_real_clue_retries_once_then_raises():
    class _Resp:
        text = "nope"

    ex = GeminiExtractor(api_key="x", dumb_model="f", smart_model="m-pro", transport=lambda *a: _Resp())
    with pytest.raises(AIError):
        ex.clue([])
