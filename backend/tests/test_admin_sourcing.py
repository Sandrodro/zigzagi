from app.ai.client import ExtractedCandidate, Suggestion
from app.ai.fakes import FakeGeminiClient
from app.main import app
from app.routers.admin import get_gemini


def _use_fake(extract=None, suggest=None):
    app.dependency_overrides[get_gemini] = lambda: FakeGeminiClient(extract_return=extract, suggest_return=suggest)


def test_extract_endpoint_persists_offered(client, db_session):
    _use_fake(extract=[
        ExtractedCandidate(surface="თბილისი", lemma="თბილისი", length=7, snippet="s", theme_relevance=0.9),
        ExtractedCandidate(surface="abc", lemma="abc", length=3, snippet="s", theme_relevance=0.1),
    ])
    resp = client.post("/api/admin/extract", json={"text": "ტექსტი", "theme": "თბილისი"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["dropped_count"] == 1
    assert len(body["candidates"]) == 1
    app.dependency_overrides.pop(get_gemini, None)


def test_suggest_endpoint(client):
    _use_fake(suggest=[Suggestion(word="მთაწმინდა", reason="r", in_corpus=False)])
    resp = client.post("/api/admin/suggest", json={"theme": "თბილისი"})
    assert resp.status_code == 200
    assert resp.json()[0]["word"] == "მთაწმინდა"
    app.dependency_overrides.pop(get_gemini, None)
