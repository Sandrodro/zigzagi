import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.client import ExtractedCandidate
from app.models import WordCandidate
from app.sourcing.validate import is_georgian_word, valid_length


def create_from_extraction(
    db: Session, candidates: list[ExtractedCandidate], theme: str
) -> tuple[list[WordCandidate], int]:
    existing = set(db.scalars(select(WordCandidate.surface)).all())
    rows, kept_surfaces, dropped = [], set(), 0
    for c in candidates:
        s = c.surface
        if not (is_georgian_word(s) and valid_length(s)) or s in existing or s in kept_surfaces:
            dropped += 1
            continue
        kept_surfaces.add(s)
        row = WordCandidate(
            id=uuid.uuid4(), surface=s, lemma=c.lemma, length=len(s),
            snippet=c.snippet, theme_tags=[theme], status="offered",
        )
        db.add(row)
        rows.append(row)
    return rows, dropped


def create_candidate(db: Session, surface: str, theme: str) -> WordCandidate:
    if not (is_georgian_word(surface) and valid_length(surface)):
        raise ValueError("invalid Georgian word (length 3-13)")
    existing = db.scalar(select(WordCandidate).where(WordCandidate.surface == surface))
    if existing is not None:
        raise ValueError("already in pool")
    row = WordCandidate(
        id=uuid.uuid4(), surface=surface, lemma=surface, length=len(surface),
        snippet=None, theme_tags=[theme], status="accepted",
    )
    db.add(row)
    db.flush()
    return row


def list_pool(db: Session, status: str | None = None, theme: str | None = None) -> list[WordCandidate]:
    stmt = select(WordCandidate)
    if status:
        stmt = stmt.where(WordCandidate.status == status)
    if theme:
        stmt = stmt.where(WordCandidate.theme_tags.any(theme))
    return list(db.scalars(stmt.order_by(WordCandidate.surface)))


def bulk_update(db: Session, ops: list[dict]) -> int:
    n = 0
    for op in ops:
        row = db.get(WordCandidate, uuid.UUID(op["id"]))
        if row is None:
            continue
        action = op["action"]
        if action == "accept":
            row.status = "accepted"
        elif action == "reject":
            row.status = "rejected"
        elif action == "edit":
            row.surface = op["surface"]
            row.status = "edited"
        n += 1
    db.flush()
    return n
