import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Puzzle


def can_publish(puzzle) -> tuple[bool, str | None]:
    if not puzzle.entries:
        return False, "puzzle has no entries"
    unfinished = [e for e in puzzle.entries if e.clue_status not in ("accepted", "edited")]
    if unfinished:
        return False, f"{len(unfinished)} clues not yet accepted"
    return True, None


def schedule_puzzle(db: Session, puzzle_id: uuid.UUID, live_date: dt.date) -> Puzzle:
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise ValueError("puzzle not found")
    ok, reason = can_publish(puzzle)
    if not ok:
        raise ValueError(reason)
    puzzle.live_date = live_date
    puzzle.status = "scheduled"
    db.flush()
    return puzzle


def runway_days(db: Session, today: dt.date) -> int:
    covered = set(
        db.scalars(
            select(Puzzle.live_date).where(
                Puzzle.status.in_(("scheduled", "published")),
                Puzzle.live_date >= today,
            )
        )
    )
    count = 0
    day = today
    while day in covered:
        count += 1
        day += dt.timedelta(days=1)
    return count


def promote_due_puzzles(db: Session, on_date: dt.date) -> int:
    stmt = select(Puzzle).where(
        Puzzle.status == "scheduled", Puzzle.live_date <= on_date
    )
    due = list(db.scalars(stmt))
    for puzzle in due:
        puzzle.status = "published"
    db.flush()
    return len(due)
