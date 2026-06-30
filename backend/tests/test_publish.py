import datetime as dt
import uuid

from app.models import Entry, Puzzle
from app.services.publish import can_publish, promote_due_puzzles, schedule_puzzle


def _draft(db, live_date):
    p = Puzzle(
        id=uuid.uuid4(), live_date=live_date, 
        grid_template={"rows": 5, "cols": 5, "blocks": [], "cells": []},
        status="draft", seed=None, version=1,
    )
    db.add(p)
    db.flush()
    return p


def _draft_with_entries(db, live_date, statuses=("accepted",)):
    p = _draft(db, live_date)
    for s in statuses:
        p.entries.append(Entry(id=uuid.uuid4(), number=1, direction="across", answer="თბილისი", row=0, col=0, clue="c", clue_status=s, provenance="sourced"))
    db.flush()
    return p


def test_schedule_sets_status_and_date(db_session):
    p = _draft_with_entries(db_session, dt.date(2026, 6, 20))
    schedule_puzzle(db_session, p.id, dt.date(2026, 6, 25))
    assert p.status == "scheduled"
    assert p.live_date == dt.date(2026, 6, 25)


def test_promote_publishes_only_due_scheduled(db_session):
    due = _draft_with_entries(db_session, dt.date(2026, 6, 18))
    schedule_puzzle(db_session, due.id, dt.date(2026, 6, 18))
    future = _draft_with_entries(db_session, dt.date(2026, 6, 30))
    schedule_puzzle(db_session, future.id, dt.date(2026, 6, 30))

    count = promote_due_puzzles(db_session, dt.date(2026, 6, 18))
    assert count == 1
    assert due.status == "published"
    assert future.status == "scheduled"


def test_can_publish_true_when_all_accepted(db_session):
    p = _draft_with_entries(db_session, dt.date(2026, 8, 2), ["accepted", "edited"])
    ok, reason = can_publish(p)
    assert ok and reason is None


def test_can_publish_allows_unfinished_clues(db_session):
    # Clue-status guard removed: publish is allowed regardless of clue state.
    p = _draft_with_entries(db_session, dt.date(2026, 8, 3), ["accepted", "generated"])
    ok, reason = can_publish(p)
    assert ok and reason is None


def test_can_publish_false_without_entries(db_session):
    p = _draft_with_entries(db_session, dt.date(2026, 8, 4), [])
    ok, reason = can_publish(p)
    assert not ok and "entries" in reason.lower()
