import datetime as dt
import json

from app.seed import seed_demo_puzzle


def test_list_returns_published_newest_first(client, db_session):
    seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 18))
    seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 20))
    seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 19), status="draft")
    db_session.flush()

    resp = client.get("/api/play/puzzles")
    assert resp.status_code == 200
    body = resp.json()
    # Only the two published puzzles, newest first; the draft is excluded.
    assert [p["date"] for p in body] == ["2026-06-20", "2026-06-18"]
    assert all(p["status"] == "published" for p in body)


def test_get_by_date_returns_structure_without_answers(client, db_session):
    seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 18))
    db_session.flush()

    resp = client.get("/api/play/puzzles/2026-06-18")
    assert resp.status_code == 200
    body = resp.json()
    assert body["date"] == "2026-06-18"
    assert "answer" not in json.dumps(body)


def test_get_by_date_404_when_not_published(client, db_session):
    resp = client.get("/api/play/puzzles/2099-01-01")
    assert resp.status_code == 404
