import datetime as dt
import uuid

from app.models import Puzzle, WordCandidate
from app.services.seeds_provider import seeds_for_puzzle


def test_returns_accepted_surfaces_for_theme(db_session):
    db_session.add(WordCandidate(id=uuid.uuid4(), surface="თბილისი", lemma="თბილისი", length=7, theme_tags=["თბილისი"], status="accepted"))
    db_session.add(WordCandidate(id=uuid.uuid4(), surface="ბათუმი", lemma="ბათუმი", length=6, theme_tags=["ბათუმი"], status="accepted"))
    db_session.add(WordCandidate(id=uuid.uuid4(), surface="რუსთავი", lemma="რუსთავი", length=7, theme_tags=["თბილისი"], status="offered"))
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 5), theme="თბილისი", grid_template={}, status="draft", seed=1, version=1)
    db_session.add(p)
    db_session.flush()
    assert seeds_for_puzzle(db_session, p) == ["თბილისი"]  # only accepted + matching theme
