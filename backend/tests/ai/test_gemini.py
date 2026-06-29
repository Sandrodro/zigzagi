import pytest

from app.ai.gemini import AIError, GeminiExtractor


class _Resp:
    def __init__(self, text):
        self.text = text


def test_extract_parses_structured_json():
    calls = []

    def transport(model, prompt, schema, think=True):
        calls.append(model)
        return _Resp('[{"surface":"თბილისი","lemma":"თბილისი","length":7,"snippet":"s","theme_relevance":0.9}]')

    ex = GeminiExtractor(api_key="x", dumb_model="m-flash", smart_model="m-flash", transport=transport)
    out = ex.extract("text", "თბილისი", [])
    assert out[0].surface == "თბილისი"
    assert calls == ["m-flash"]


def test_extract_retries_once_then_raises():
    def transport(model, prompt, schema, think=True):
        return _Resp("not json")

    ex = GeminiExtractor(api_key="x", dumb_model="m", smart_model="m", transport=transport)
    with pytest.raises(AIError):
        ex.extract("t", "th", [])
