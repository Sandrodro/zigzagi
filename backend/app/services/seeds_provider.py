from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Puzzle, WordCandidate


def seeds_for_puzzle(db: Session, puzzle: Puzzle) -> list[str]:
    stmt = (
        select(WordCandidate.surface)
        .where(
            WordCandidate.status.in_(("accepted", "edited")),
            WordCandidate.theme_tags.any(puzzle.theme),
        )
        .order_by(WordCandidate.surface)
    )
    return list(db.scalars(stmt))
