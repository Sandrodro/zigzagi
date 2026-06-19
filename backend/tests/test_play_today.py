import datetime as dt
import json

from app.seed import seed_demo_puzzle
import app.services.puzzles as puzzles_service


def _force_today(monkeypatch, day):
    monkeypatch.setattr(puzzles_service, "today_tbilisi", lambda: day)


def test_today_returns_structure_without_answers(client, db_session, monkeypatch):
    today = dt.date(2026, 6, 18)
    seed_demo_puzzle(db_session, live_date=today)
    db_session.flush()
    _force_today(monkeypatch, today)

    response = client.get("/api/play/puzzles/today")
    assert response.status_code == 200
    body = response.json()

    assert body["date"] == "2026-06-18"
    assert body["size"] == {"rows": 5, "cols": 5}
    assert len(body["clues"]["across"]) == 5
    assert len(body["clues"]["down"]) == 5
    # Clues carry text + length but NEVER the answer string.
    assert "answer" not in json.dumps(body)
    first = body["clues"]["across"][0]
    assert first["number"] == 1 and first["length"] == 5 and first["cell"] == [0, 0]


def test_today_404_when_none_published(client, db_session, monkeypatch):
    _force_today(monkeypatch, dt.date(2099, 1, 1))
    response = client.get("/api/play/puzzles/today")
    assert response.status_code == 404
