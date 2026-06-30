from app.ai.client import ExtractedCandidate
from app.ai.fakes import FakeGeminiClient


def test_fake_returns_canned_extraction():
    fake = FakeGeminiClient(
        extract_return=[ExtractedCandidate(surface="თბილისი", lemma="თბილისი", length=7, snippet="...", theme_relevance=0.9)]
    )
    out = fake.extract("text", [])
    assert out[0].surface == "თბილისი"
