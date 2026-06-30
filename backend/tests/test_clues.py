import datetime as dt
import uuid

from app.ai.client import ClueResult
from app.ai.fakes import FakeGeminiClient
from app.models import ClueEvent, Entry, Puzzle
from app.services.clues import accept_rate, generate_clues, review_clue


def _puzzle_with_entry(db, clue_status="pending"):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 8, 1), grid_template={}, status="draft", seed=1, version=1)
    e = Entry(id=uuid.uuid4(), number=1, direction="across", answer="თბილისი", row=0, col=0, clue=None, clue_status=clue_status, provenance="sourced")
    p.entries.append(e)
    db.add(p)
    db.flush()
    return p, e


def test_generate_fills_pending_entries(db_session):
    p, e = _puzzle_with_entry(db_session)
    ai = FakeGeminiClient(clue_return=[ClueResult(entry_id=str(e.id), clue="საქართველოს დედაქალაქი")])
    n = generate_clues(db_session, p, ai)
    db_session.flush()
    assert n == 1 and e.clue == "საქართველოს დედაქალაქი" and e.clue_status == "generated"


def test_accept_logs_event(db_session):
    p, e = _puzzle_with_entry(db_session, clue_status="generated")
    e.clue = "ძველი"
    db_session.flush()
    review_clue(db_session, e.id, "accept")
    db_session.flush()
    assert e.clue_status == "accepted"
    assert db_session.query(ClueEvent).filter_by(entry_id=e.id, action="accept").count() == 1


def test_edit_sets_status_and_logs_old_and_new(db_session):
    p, e = _puzzle_with_entry(db_session, clue_status="generated")
    e.clue = "ძველი"
    db_session.flush()
    review_clue(db_session, e.id, "edit", new_clue="ახალი")
    db_session.flush()
    assert e.clue == "ახალი" and e.clue_status == "edited"
    ev = db_session.query(ClueEvent).filter_by(entry_id=e.id, action="edit").one()
    assert ev.old_clue == "ძველი" and ev.new_clue == "ახალი"


def test_reject_regenerates(db_session):
    p, e = _puzzle_with_entry(db_session, clue_status="generated")
    e.clue = "ცუდი"
    db_session.flush()
    ai = FakeGeminiClient(clue_return=[ClueResult(entry_id=str(e.id), clue="უკეთესი")])
    review_clue(db_session, e.id, "reject", ai=ai)
    db_session.flush()
    assert e.clue == "უკეთესი" and e.clue_status == "generated"


def test_accept_rate(db_session):
    p, e = _puzzle_with_entry(db_session, clue_status="generated")
    e.clue = "x"
    db_session.flush()
    review_clue(db_session, e.id, "accept")
    db_session.flush()
    assert accept_rate(db_session, p) == 1.0
