import datetime as dt
import uuid

from sqlalchemy.orm import Session

from app.models import Entry, Puzzle

_MATRIX = [
    "აბგდე",
    "ვზთიკ",
    "ლმნოპ",
    "ჟრსტუ",
    "ფქღყშ",
]

_ENTRIES = [
    (1, "across", 0, 0), (6, "across", 1, 0), (7, "across", 2, 0),
    (8, "across", 3, 0), (9, "across", 4, 0),
    (1, "down", 0, 0), (2, "down", 0, 1), (3, "down", 0, 2),
    (4, "down", 0, 3), (5, "down", 0, 4),
]

_NUMBERED_CELLS = [
    {"row": 0, "col": 0, "number": 1},
    {"row": 0, "col": 1, "number": 2},
    {"row": 0, "col": 2, "number": 3},
    {"row": 0, "col": 3, "number": 4},
    {"row": 0, "col": 4, "number": 5},
    {"row": 1, "col": 0, "number": 6},
    {"row": 2, "col": 0, "number": 7},
    {"row": 3, "col": 0, "number": 8},
    {"row": 4, "col": 0, "number": 9},
]


def _answer_for(direction: str, row: int, col: int) -> str:
    if direction == "across":
        return _MATRIX[row]
    return "".join(_MATRIX[r][col] for r in range(5))


def seed_demo_puzzle(db: Session, live_date: dt.date, status: str = "published") -> Puzzle:
    puzzle = Puzzle(
        id=uuid.uuid4(),
        live_date=live_date,
        grid_template={"rows": 5, "cols": 5, "blocks": [], "cells": _NUMBERED_CELLS},
        status=status,
        seed=None,
        version=1,
    )
    for number, direction, row, col in _ENTRIES:
        puzzle.entries.append(
            Entry(
                id=uuid.uuid4(),
                number=number,
                direction=direction,
                answer=_answer_for(direction, row, col),
                row=row,
                col=col,
                clue=f"მინიშნება {number} {direction}",
                clue_status="accepted",
                provenance="sourced",
            )
        )
    db.add(puzzle)
    return puzzle


if __name__ == "__main__":
    from app.db import SessionLocal
    from app.services.puzzles import today_tbilisi

    with SessionLocal() as db:
        seed_demo_puzzle(db, live_date=today_tbilisi())
        db.commit()
        print("seeded today's demo puzzle")
