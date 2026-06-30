# backend/tests/test_admin_delete_puzzle.py
import datetime as dt
import uuid

from sqlalchemy import select

from app.models import Entry, Puzzle


def _mk(db):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), 
               grid_template={}, status="draft", seed=None, version=1)
    db.add(p)
    db.flush()
    db.add(Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="across",
                 answer="დედა", row=0, col=0, clue=None, clue_status="pending",
                 provenance="manual"))
    db.flush()
    return p


def test_delete_puzzle_removes_puzzle_and_entries(client, db_session):
    p = _mk(db_session)
    res = client.delete(f"/api/admin/puzzles/{p.id}")
    assert res.status_code == 204
    assert db_session.get(Puzzle, p.id) is None
    entries = db_session.scalars(select(Entry).where(Entry.puzzle_id == p.id)).all()
    assert entries == []


def test_delete_missing_puzzle_404(client, db_session):
    res = client.delete(f"/api/admin/puzzles/{uuid.uuid4()}")
    assert res.status_code == 404
