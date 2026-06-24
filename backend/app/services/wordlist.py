import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import WordpoolGeneric, WordpoolLemma
from app.sourcing.validate import is_georgian_word


def _reject_reason(word: str) -> str | None:
    if len(word) < 3:
        return "length<3"
    if len(word) > 13:
        return "length>13"
    if not is_georgian_word(word):
        return "non-georgian"
    return None


def add_word(db: Session, word: str) -> WordpoolGeneric:
    reason = _reject_reason(word)
    if reason is not None:
        raise ValueError(reason)
    existing = db.scalar(select(WordpoolGeneric).where(WordpoolGeneric.word == word))
    if existing is not None:
        return existing
    row = WordpoolGeneric(id=uuid.uuid4(), word=word, length=len(word), status="active")
    db.add(row)
    db.flush()
    return row


def block_word(db: Session, word: str) -> WordpoolGeneric:
    row = db.scalar(select(WordpoolGeneric).where(WordpoolGeneric.word == word))
    if row is None:
        row = WordpoolGeneric(id=uuid.uuid4(), word=word, length=len(word), status="blocked")
        db.add(row)
    else:
        row.status = "blocked"
    db.flush()
    return row


def list_words(
    db: Session, status: str | None = None, length: int | None = None, search: str | None = None
) -> list[WordpoolGeneric]:
    stmt = select(WordpoolGeneric)
    if status:
        stmt = stmt.where(WordpoolGeneric.status == status)
    if length:
        stmt = stmt.where(WordpoolGeneric.length == length)
    if search:
        stmt = stmt.where(WordpoolGeneric.word.contains(search))
    return list(db.scalars(stmt.order_by(WordpoolGeneric.word)))


def update_entry(
    db: Session, entry_id: uuid.UUID, word: str | None = None, status: str | None = None
) -> WordpoolGeneric:
    row = db.get(WordpoolGeneric, entry_id)
    if row is None:
        raise ValueError("not found")
    if status is not None:
        if status not in ("active", "blocked"):
            raise ValueError("invalid status")
        row.status = status
    if word is not None:
        reason = _reject_reason(word)
        if reason is not None:
            raise ValueError(reason)
        row.word = word
        row.length = len(word)
    db.flush()
    return row


def bulk_import(db: Session, words: list[str]) -> dict:
    existing = set(db.scalars(select(WordpoolGeneric.word)))
    added, rejected, seen = 0, [], set()
    for w in words:
        reason = _reject_reason(w)
        if reason is not None:
            rejected.append({"word": w, "reason": reason})
            continue
        if w in existing or w in seen:
            continue  # ponytail: silent dedupe; surfacing dup counts is YAGNI
        seen.add(w)
        db.add(WordpoolGeneric(id=uuid.uuid4(), word=w, length=len(w), status="active"))
        added += 1
    db.flush()
    return {"added": added, "rejected": rejected}


def bulk_import_lemmas(db: Session, words: list[str], source: str = "gemini") -> dict:
    existing = set(db.scalars(select(WordpoolLemma.word)))
    added, rejected, seen = 0, [], set()
    for w in words:
        reason = _reject_reason(w)
        if reason is not None:
            rejected.append({"word": w, "reason": reason})
            continue
        if w in existing or w in seen:
            continue  # ponytail: silent dedupe, mirrors bulk_import
        seen.add(w)
        db.add(WordpoolLemma(id=uuid.uuid4(), word=w, length=len(w), source=source, status="active"))
        added += 1
    db.flush()
    return {"added": added, "rejected": rejected}


def existing_lemmas(db: Session) -> set[str]:
    return set(db.scalars(select(WordpoolLemma.word)))


def stats(db: Session) -> dict:
    def _count(status: str) -> int:
        return db.scalar(
            select(func.count()).select_from(WordpoolGeneric).where(WordpoolGeneric.status == status)
        ) or 0

    rows = db.execute(
        select(WordpoolGeneric.length, func.count())
        .where(WordpoolGeneric.status == "active")
        .group_by(WordpoolGeneric.length)
    ).all()
    by_len = {length: count for length, count in rows}
    return {
        "active": _count("active"),
        "blocked": _count("blocked"),
        "by_length": {n: by_len.get(n, 0) for n in range(3, 14)},
    }
