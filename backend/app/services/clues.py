import logging
import uuid

from sqlalchemy.orm import Session

from app.ai.client import ClueRequest, GeminiClient
from app.models import ClueEvent, Entry, Puzzle

log = logging.getLogger(__name__)


def generate_clues(db: Session, puzzle: Puzzle, ai: GeminiClient) -> int:
    pending = [e for e in puzzle.entries if e.clue_status in ("pending", "rejected")]
    if not pending:
        log.info("clue gen skipped: puzzle=%s no pending entries", puzzle.id)
        return 0
    log.info("clue gen start: puzzle=%s pending=%d", puzzle.id, len(pending))
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
    log.info("clue gen done: puzzle=%s clues=%d/%d", puzzle.id, n, len(pending))
    return n


def generate_theme_and_clues(db: Session, puzzle: Puzzle, ai: GeminiClient) -> int:
    """One LLM call over ALL answers → sets puzzle.theme + a clue per entry."""
    entries = list(puzzle.entries)
    if not entries:
        log.info("autoclue skipped: puzzle=%s has no entries", puzzle.id)
        return 0
    log.info("autoclue start: puzzle=%s answers=%d", puzzle.id, len(entries))
    batch = [
        ClueRequest(
            entry_id=str(e.id),
            answer=e.answer,
            direction=e.direction,
            number=e.number,
            theme=puzzle.theme,
            source_snippet=None,
        )
        for e in entries
    ]
    result = ai.theme_and_clues(batch)
    puzzle.theme = result.theme
    by_id = {str(e.id): e for e in entries}
    n = 0
    for c in result.clues:
        entry = by_id.get(c.entry_id)
        if entry is not None:
            entry.clue = c.clue
            entry.clue_status = "generated"
            n += 1
    db.flush()
    log.info("autoclue done: puzzle=%s theme=%r clues=%d/%d", puzzle.id, result.theme, n, len(entries))
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
