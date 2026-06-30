import json

from app.ai.client import WordCheck
from app.ai.gemini import GeminiExtractor


class _Resp:
    def __init__(self, text): self.text = text


def test_check_word_parses_object():
    captured = {}

    def transport(model, prompt, schema):
        captured["model"] = model
        captured["prompt"] = prompt
        return _Resp(json.dumps({"valid": False, "replacement": "დედამიწა"}))

    ai = GeminiExtractor(api_key="x", dumb_model="e", smart_model="s",
                         transport=transport)
    out = ai.check_word("ზზზზზზზზ", "__დ_____", 8)
    assert isinstance(out, WordCheck)
    assert out.valid is False
    assert out.replacement == "დედამიწა"
    assert captured["model"] == "s"  # uses the SUGGEST model
