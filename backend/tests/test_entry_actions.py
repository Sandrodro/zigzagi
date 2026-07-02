import datetime as dt
import uuid

from sqlalchemy import select

from app.main import app
from app.models import Entry, Puzzle, WordpoolLemma


def _cross(db):
    # across "ომი" and down "ომა" share cell (0,0); only (0,0) is crossed.
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), 
               grid_template={}, status="draft", seed=None, version=1)
    db.add(p); db.flush()
    a = Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="across",
              answer="ომი", row=0, col=0, clue=None, clue_status="pending", provenance="auto")
    d = Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="down",
              answer="ომა", row=0, col=0, clue=None, clue_status="pending", provenance="auto")
    db.add_all([a, d]); db.flush()
    for w in ("ომი", "ომა", "ოთა", "ოხა"):  # all start with ო → fit pattern "ო__"
        db.add(WordpoolLemma(id=uuid.uuid4(), word=w, length=3, source="manual", status="active"))
    db.flush()
    return p, a, d


def test_swap_places_a_different_fitting_word(client, db_session):
    p, a, _ = _cross(db_session)
    body = client.post(f"/api/admin/puzzles/{p.id}/entries/{a.id}/swap").json()
    assert body["replaced"] is True
    assert body["word"] != "ომი"      # different word
    assert body["word"][0] == "ო"     # crossing cell preserved


def test_block_word_blocks_and_refills(client, db_session):
    p, a, _ = _cross(db_session)
    body = client.post(f"/api/admin/puzzles/{p.id}/entries/{a.id}/block-word").json()
    assert body["blocked"] == "ომი"
    assert body["word"] != "ომი"
    status = db_session.scalar(select(WordpoolLemma.status).where(WordpoolLemma.word == "ომი"))
    assert status == "blocked"


def test_block_word_with_no_replacement_drops_entry(client, db_session):
    p, a, _ = _cross(db_session)
    # remove the alternatives so nothing fits the "ო__" pattern after blocking ომი
    db_session.query(WordpoolLemma).filter(WordpoolLemma.word.in_(["ომა", "ოთა", "ოხა"])).delete()
    db_session.flush()
    body = client.post(f"/api/admin/puzzles/{p.id}/entries/{a.id}/block-word").json()
    assert body["blocked"] == "ომი"
    assert body["replaced"] is False
    assert body["removed"] is True
    assert db_session.get(Entry, a.id) is None  # entry dropped from the crossword


def test_delete_entry_removes_it(client, db_session):
    p, a, _ = _cross(db_session)
    res = client.delete(f"/api/admin/puzzles/{p.id}/entries/{a.id}")
    assert res.status_code == 204
    assert db_session.get(Entry, a.id) is None
