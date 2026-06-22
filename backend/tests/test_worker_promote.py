import datetime as dt
import uuid

from app.models import Puzzle
from app.worker import promote_tick


def test_promote_tick_publishes_due(db_session):
    today = dt.date(2026, 6, 18)
    db_session.add(Puzzle(id=uuid.uuid4(), live_date=today, theme="t", grid_template={}, status="scheduled", seed=1, version=1))
    db_session.add(Puzzle(id=uuid.uuid4(), live_date=today + dt.timedelta(days=5), theme="t", grid_template={}, status="scheduled", seed=1, version=1))
    db_session.flush()
    assert promote_tick(db_session, today) == 1
    # Idempotent: second call promotes nothing new.
    assert promote_tick(db_session, today) == 0
