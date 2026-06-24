from app.ai.fakes import FakeGeminiClient
from app.main import app
from app.models import WordpoolLemma
from app.routers.admin import get_gemini
from app.services.article import filter_article


def test_filter_article_drops_punctuation_short_and_dupes():
    text = "დედა, მამა! და-და 12 ok დედა — ბაბუა."
    # "და" is 2 letters (dropped); "12"/"ok" non-georgian; "დედა" deduped.
    assert filter_article(text) == ["დედა", "მამა", "ბაბუა"]


def test_filter_article_drops_numbers_and_roman_numerals():
    # Georgian-only regex already excludes digits and Latin roman numerals.
    assert filter_article("საუკუნე XXI 2024 III მე-20 ომი") == ["საუკუნე", "ომი"]


def test_from_article_endpoint(client, db_session):
    # one lemma already in the pool → flagged already_added
    db_session.add(WordpoolLemma(word="ბაბუა", length=5, source="ud", status="active"))
    db_session.flush()

    app.dependency_overrides[get_gemini] = lambda: FakeGeminiClient(
        lemmatize_return=["დედა", "ბაბუა", "ab", "x"]  # ab/x get validation-dropped
    )
    try:
        res = client.post("/api/admin/from-article", json={"text": "დედები ბაბუას"})
        assert res.status_code == 200
        assert res.json()["lemmas"] == [
            {"word": "დედა", "already_added": False},
            {"word": "ბაბუა", "already_added": True},
        ]
    finally:
        app.dependency_overrides.pop(get_gemini, None)


def test_lemmas_bulk_inserts_with_source_gemini(client, db_session):
    res = client.post("/api/admin/wordlist/lemmas/bulk", json={"words": ["დედა", "მამა", "ab"]})
    assert res.status_code == 200
    body = res.json()
    assert body["added"] == 2
    assert body["rejected"] == [{"word": "ab", "reason": "length<3"}]
    rows = {r.word: r.source for r in db_session.query(WordpoolLemma).all()}
    assert rows == {"დედა": "gemini", "მამა": "gemini"}
