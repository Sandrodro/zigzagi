import datetime as dt
import uuid

from app.models import Entry, Puzzle


def _puzzle(status="published", live_date=dt.date(2026, 6, 18)):
    return Puzzle(
        id=uuid.uuid4(),
        live_date=live_date,
        theme="თბილისი",
        grid_template={"rows": 5, "cols": 5, "blocks": [], "cells": []},
        status=status,
        seed=None,
        version=1,
    )


def test_puzzle_with_entries_persists(db_session):
    p = _puzzle()
    p.entries.append(
        Entry(
            id=uuid.uuid4(), number=1, direction="across", answer="აბგდე",
            row=0, col=0, clue="clue", clue_status="accepted", provenance="sourced",
        )
    )
    db_session.add(p)
    db_session.flush()
    loaded = db_session.get(Puzzle, p.id)
    assert len(loaded.entries) == 1
    assert loaded.entries[0].answer == "აბგდე"


def test_two_active_puzzles_different_dates_ok(db_session):
    db_session.add(_puzzle(live_date=dt.date(2026, 6, 18)))
    db_session.add(_puzzle(live_date=dt.date(2026, 6, 19)))
    db_session.flush()  # no error


def test_draft_does_not_collide_with_active(db_session):
    db_session.add(_puzzle(status="published"))
    db_session.add(_puzzle(status="draft"))
    db_session.flush()  # drafts are exempt from the partial index
