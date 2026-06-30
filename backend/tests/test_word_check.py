# backend/tests/test_word_check.py
import datetime as dt
import uuid

from app.ai.client import WordCheck
from app.models import Entry, Puzzle, WordpoolLemma
from app.services.word_check import check_and_fix_entry, check_puzzle, entry_pattern
from sqlalchemy import select


class FakeAI:
    """Returns a preset WordCheck per word; defaults to valid."""
    def __init__(self, verdicts): self.verdicts = verdicts
    def check_word(self, word, pattern, length): return self.verdicts.get(word, WordCheck(valid=True))


def _puzzle_with_cross(db):
    # 1A "დედა" at (0,0) across; 1D "დ..." crossing at (0,0) so col 0 is checked.
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), 
               grid_template={}, status="draft", seed=None, version=1)
    db.add(p); db.flush()
    across = Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="across",
                   answer="დედა", row=0, col=0, clue=None, clue_status="pending", provenance="manual")
    down = Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="down",
                 answer="დათვი", row=0, col=0, clue=None, clue_status="pending", provenance="manual")
    db.add_all([across, down]); db.flush()
    return p, across, down


def test_pattern_keeps_checked_cells(db_session):
    p, across, _ = _puzzle_with_cross(db_session)
    # across "დედა": cell (0,0) is crossed by the down entry -> kept; others unchecked.
    assert entry_pattern(p, across) == "დ___"


def test_invalid_word_blocked_and_replaced(db_session):
    p, across, _ = _puzzle_with_cross(db_session)
    ai = FakeAI({"დედა": WordCheck(valid=False, replacement="დილა")})  # fits "დ___"
    out = check_and_fix_entry(db_session, p, across, ai)
    assert out == {"valid": False, "replaced_with": "დილა"}
    assert across.answer == "დილა"
    blocked = db_session.scalar(select(WordpoolLemma).where(WordpoolLemma.word == "დედა"))
    assert blocked.status == "blocked"
    added = db_session.scalar(select(WordpoolLemma).where(WordpoolLemma.word == "დილა"))
    assert added.status == "active"


def test_replacement_violating_pattern_is_rejected(db_session):
    p, across, _ = _puzzle_with_cross(db_session)
    ai = FakeAI({"დედა": WordCheck(valid=False, replacement="მზერა")})  # breaks the "დ" prefix
    out = check_and_fix_entry(db_session, p, across, ai)
    assert out == {"valid": False, "replaced_with": None}
    assert across.answer == "დედა"  # unchanged


def test_check_puzzle_aggregates(db_session):
    p, across, down = _puzzle_with_cross(db_session)
    ai = FakeAI({"დათვი": WordCheck(valid=False, replacement="დანები")})  # wrong length -> rejected? len 6 vs 5
    out = check_puzzle(db_session, p, ai)
    assert out["checked"] == 2
    assert out["invalid"] == 1
