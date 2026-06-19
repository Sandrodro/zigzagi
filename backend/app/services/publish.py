import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Puzzle


def schedule_puzzle(db: Session, puzzle_id: uuid.UUID, live_date: dt.date) -> Puzzle:
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise ValueError("puzzle not found")
    puzzle.live_date = live_date
    puzzle.status = "scheduled"
    db.flush()
    return puzzle


def promote_due_puzzles(db: Session, on_date: dt.date) -> int:
    stmt = select(Puzzle).where(
        Puzzle.status == "scheduled", Puzzle.live_date <= on_date
    )
    due = list(db.scalars(stmt))
    for puzzle in due:
        puzzle.status = "published"
    db.flush()
    return len(due)
