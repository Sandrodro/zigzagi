import datetime as dt
import uuid

from app.models import Puzzle
from app.services.publish import promote_due_puzzles, schedule_puzzle


def _draft(db, live_date):
    p = Puzzle(
        id=uuid.uuid4(), live_date=live_date, theme="t",
        grid_template={"rows": 5, "cols": 5, "blocks": [], "cells": []},
        status="draft", seed=None, version=1,
    )
    db.add(p)
    db.flush()
    return p


def test_schedule_sets_status_and_date(db_session):
    p = _draft(db_session, dt.date(2026, 6, 20))
    schedule_puzzle(db_session, p.id, dt.date(2026, 6, 25))
    assert p.status == "scheduled"
    assert p.live_date == dt.date(2026, 6, 25)


def test_promote_publishes_only_due_scheduled(db_session):
    due = _draft(db_session, dt.date(2026, 6, 18))
    schedule_puzzle(db_session, due.id, dt.date(2026, 6, 18))
    future = _draft(db_session, dt.date(2026, 6, 30))
    schedule_puzzle(db_session, future.id, dt.date(2026, 6, 30))

    count = promote_due_puzzles(db_session, dt.date(2026, 6, 18))
    assert count == 1
    assert due.status == "published"
    assert future.status == "scheduled"
