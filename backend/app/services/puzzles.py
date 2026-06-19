import datetime as dt
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Puzzle

_TBILISI = ZoneInfo("Asia/Tbilisi")


def today_tbilisi() -> dt.date:
    return dt.datetime.now(_TBILISI).date()


def get_published_puzzle(db: Session, on_date: dt.date) -> Puzzle | None:
    stmt = select(Puzzle).where(
        Puzzle.live_date == on_date, Puzzle.status == "published"
    )
    return db.scalars(stmt).first()


def to_play_dto(puzzle: Puzzle) -> dict:
    across, down = [], []
    for e in puzzle.entries:
        ref = {
            "number": e.number,
            "cell": [e.row, e.col],
            "length": len(e.answer),
            "text": e.clue,
        }
        (across if e.direction == "across" else down).append(ref)
    across.sort(key=lambda r: r["number"])
    down.sort(key=lambda r: r["number"])
    gt = puzzle.grid_template
    return {
        "date": puzzle.live_date.isoformat(),
        "theme": puzzle.theme,
        "size": {"rows": gt["rows"], "cols": gt["cols"]},
        "blocks": gt["blocks"],
        "cells": gt["cells"],
        "clues": {"across": across, "down": down},
    }
