import datetime as dt
import uuid

from app.models import Puzzle
from app.services.publish import runway_days


def _live(db, day, status="scheduled"):
    db.add(Puzzle(id=uuid.uuid4(), live_date=day, grid_template={}, status=status, seed=1, version=1))


def test_runway_counts_consecutive_days(db_session):
    base = dt.date(2026, 6, 18)
    for i in range(3):  # today, +1, +2
        _live(db_session, base + dt.timedelta(days=i))
    db_session.flush()
    assert runway_days(db_session, base) == 3


def test_runway_stops_at_gap(db_session):
    base = dt.date(2026, 6, 18)
    _live(db_session, base)
    _live(db_session, base + dt.timedelta(days=2))  # gap at +1
    db_session.flush()
    assert runway_days(db_session, base) == 1


def test_runway_zero_when_today_uncovered(db_session):
    base = dt.date(2026, 6, 18)
    _live(db_session, base + dt.timedelta(days=1))
    db_session.flush()
    assert runway_days(db_session, base) == 0
