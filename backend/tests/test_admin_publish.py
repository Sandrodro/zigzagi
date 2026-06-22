import datetime as dt
import uuid

from app.models import Entry, Puzzle


def _ready_puzzle(db, day):  # a puzzle whose clues are all accepted
    p = Puzzle(id=uuid.uuid4(), live_date=day, theme="t", grid_template={}, status="draft", seed=1, version=1)
    p.entries.append(Entry(id=uuid.uuid4(), number=1, direction="across", answer="თბილისი", row=0, col=0, clue="c", clue_status="accepted", provenance="sourced"))
    db.add(p)
    db.flush()
    return p


def test_schedule_succeeds(client, db_session):
    p = _ready_puzzle(db_session, dt.date(2026, 9, 1))
    db_session.flush()
    resp = client.post(f"/api/admin/puzzles/{p.id}/schedule", json={"live_date": "2026-09-10"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "scheduled"


def test_schedule_allowed_with_unfinished_clues(client, db_session):
    # Clue-status guard removed: scheduling no longer requires accepted clues.
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 9, 4), theme="t", grid_template={}, status="draft", seed=1, version=1)
    p.entries.append(Entry(id=uuid.uuid4(), number=1, direction="across", answer="თბილისი", row=0, col=0, clue="c", clue_status="generated", provenance="sourced"))
    db_session.add(p)
    db_session.flush()
    resp = client.post(f"/api/admin/puzzles/{p.id}/schedule", json={"live_date": "2026-09-25"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "scheduled"


def test_runway_endpoint(client, db_session):
    resp = client.get("/api/admin/dashboard/runway")
    assert resp.status_code == 200
    body = resp.json()
    assert "runway_days" in body and "warning" in body
