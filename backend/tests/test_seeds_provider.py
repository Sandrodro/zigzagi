import datetime as dt
import uuid

from app.models import Puzzle, WordCandidate
from app.services.seeds_provider import seeds_for_puzzle


def test_returns_accepted_surfaces(db_session):
    db_session.add(WordCandidate(id=uuid.uuid4(), surface="თბილისი", lemma="თბილისი", length=7, status="accepted"))
    db_session.add(WordCandidate(id=uuid.uuid4(), surface="ბათუმი", lemma="ბათუმი", length=6, status="accepted"))
    db_session.add(WordCandidate(id=uuid.uuid4(), surface="რუსთავი", lemma="რუსთავი", length=7, status="offered"))
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 5), grid_template={}, status="draft", seed=1, version=1)
    db_session.add(p)
    db_session.flush()
    # all accepted surfaces, ordered by surface; "offered" excluded
    assert seeds_for_puzzle(db_session, p) == ["ბათუმი", "თბილისი"]
