# backend/tests/test_admin_list_puzzles.py
import datetime as dt
import uuid

from app.models import Entry, Puzzle


def _mk(db, status, day):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, day), theme=f"th{day}",
               grid_template={}, status=status, seed=None, version=1)
    db.add(p)
    db.flush()
    db.add(Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="across",
                 answer="დედა", row=0, col=0, clue=None, clue_status="pending",
                 provenance="manual"))
    db.flush()
    return p


def test_list_all_puzzles_any_status(client, db_session):
    _mk(db_session, "draft", 1)
    _mk(db_session, "published", 2)
    res = client.get("/api/admin/puzzles")
    assert res.status_code == 200
    rows = res.json()
    statuses = {r["status"] for r in rows}
    assert {"draft", "published"} <= statuses
    assert all(r["entry_count"] == 1 for r in rows)
    assert rows[0]["live_date"] >= rows[-1]["live_date"]  # desc
