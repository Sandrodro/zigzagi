import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import WordlistEntry
from app.sourcing.validate import is_georgian_word


def _reject_reason(word: str) -> str | None:
    if len(word) < 3:
        return "length<3"
    if len(word) > 13:
        return "length>13"
    if not is_georgian_word(word):
        return "non-georgian"
    return None


def add_word(db: Session, word: str) -> WordlistEntry:
    reason = _reject_reason(word)
    if reason is not None:
        raise ValueError(reason)
    existing = db.scalar(select(WordlistEntry).where(WordlistEntry.word == word))
    if existing is not None:
        return existing
    row = WordlistEntry(id=uuid.uuid4(), word=word, length=len(word), status="active")
    db.add(row)
    db.flush()
    return row


def block_word(db: Session, word: str) -> WordlistEntry:
    row = db.scalar(select(WordlistEntry).where(WordlistEntry.word == word))
    if row is None:
        row = WordlistEntry(id=uuid.uuid4(), word=word, length=len(word), status="blocked")
        db.add(row)
    else:
        row.status = "blocked"
    db.flush()
    return row


def list_words(
    db: Session, status: str | None = None, length: int | None = None, search: str | None = None
) -> list[WordlistEntry]:
    stmt = select(WordlistEntry)
    if status:
        stmt = stmt.where(WordlistEntry.status == status)
    if length:
        stmt = stmt.where(WordlistEntry.length == length)
    if search:
        stmt = stmt.where(WordlistEntry.word.contains(search))
    return list(db.scalars(stmt.order_by(WordlistEntry.word)))


def update_entry(
    db: Session, entry_id: uuid.UUID, word: str | None = None, status: str | None = None
) -> WordlistEntry:
    row = db.get(WordlistEntry, entry_id)
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
    existing = set(db.scalars(select(WordlistEntry.word)))
    added, rejected, seen = 0, [], set()
    for w in words:
        reason = _reject_reason(w)
        if reason is not None:
            rejected.append({"word": w, "reason": reason})
            continue
        if w in existing or w in seen:
            continue  # ponytail: silent dedupe; surfacing dup counts is YAGNI
        seen.add(w)
        db.add(WordlistEntry(id=uuid.uuid4(), word=w, length=len(w), status="active"))
        added += 1
    db.flush()
    return {"added": added, "rejected": rejected}


def stats(db: Session) -> dict:
    def _count(status: str) -> int:
        return db.scalar(
            select(func.count()).select_from(WordlistEntry).where(WordlistEntry.status == status)
        ) or 0

    rows = db.execute(
        select(WordlistEntry.length, func.count())
        .where(WordlistEntry.status == "active")
        .group_by(WordlistEntry.length)
    ).all()
    by_len = {length: count for length, count in rows}
    return {
        "active": _count("active"),
        "blocked": _count("blocked"),
        "by_length": {n: by_len.get(n, 0) for n in range(3, 14)},
    }
