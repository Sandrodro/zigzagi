import uuid

from sqlalchemy.orm import Session

from app.ai.client import ClueRequest, GeminiClient
from app.models import ClueEvent, Entry, Puzzle


def generate_clues(db: Session, puzzle: Puzzle, ai: GeminiClient) -> int:
    pending = [e for e in puzzle.entries if e.clue_status in ("pending", "rejected")]
    if not pending:
        return 0
    batch = [
        ClueRequest(
            entry_id=str(e.id),
            answer=e.answer,
            direction=e.direction,
            number=e.number,
            theme=puzzle.theme,
            source_snippet=None,
        )
        for e in pending
    ]
    results = {r.entry_id: r.clue for r in ai.clue(batch)}
    by_id = {str(e.id): e for e in pending}
    n = 0
    for eid, clue in results.items():
        entry = by_id.get(eid)
        if entry is not None:
            entry.clue = clue
            entry.clue_status = "generated"
            n += 1
    db.flush()
    return n


def review_clue(
    db: Session,
    entry_id: uuid.UUID,
    action: str,
    new_clue: str | None = None,
    ai: GeminiClient | None = None,
) -> Entry:
    entry = db.get(Entry, entry_id)
    old = entry.clue
    if action == "accept":
        entry.clue_status = "accepted"
        db.add(
            ClueEvent(
                id=uuid.uuid4(),
                entry_id=entry.id,
                action="accept",
                old_clue=old,
                new_clue=old,
            )
        )
    elif action == "edit":
        entry.clue = new_clue
        entry.clue_status = "edited"
        db.add(
            ClueEvent(
                id=uuid.uuid4(),
                entry_id=entry.id,
                action="edit",
                old_clue=old,
                new_clue=new_clue,
            )
        )
    elif action == "reject":
        db.add(
            ClueEvent(
                id=uuid.uuid4(),
                entry_id=entry.id,
                action="reject",
                old_clue=old,
                new_clue=None,
            )
        )
        entry.clue_status = "rejected"
        if ai is not None:
            puzzle = db.get(Puzzle, entry.puzzle_id)
            generate_clues(db, puzzle, ai)  # regenerates this rejected entry
    else:
        raise ValueError(f"unknown action {action}")
    db.flush()
    return entry


def accept_rate(db: Session, puzzle: Puzzle) -> float:
    reviewed = [
        e for e in puzzle.entries if e.clue_status in ("accepted", "edited", "rejected")
    ]
    if not reviewed:
        return 0.0
    good = [e for e in reviewed if e.clue_status in ("accepted", "edited")]
    return len(good) / len(reviewed)
