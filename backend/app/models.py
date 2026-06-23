import datetime as dt
import uuid

from sqlalchemy import ARRAY, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Puzzle(Base):
    __tablename__ = "puzzles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    live_date: Mapped[dt.date] = mapped_column()
    theme: Mapped[str] = mapped_column()
    grid_template: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(default="draft")
    seed: Mapped[int | None] = mapped_column(nullable=True)
    version: Mapped[int] = mapped_column(default=1)

    entries: Mapped[list["Entry"]] = relationship(
        back_populates="puzzle", cascade="all, delete-orphan"
    )
    # ponytail: one-puzzle-per-date uniqueness dropped during dev; re-add the partial
    # unique index on (live_date) where status in (scheduled,published) before launch.


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    puzzle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("puzzles.id"))
    number: Mapped[int] = mapped_column()
    direction: Mapped[str] = mapped_column()  # "across" | "down"
    answer: Mapped[str] = mapped_column()
    row: Mapped[int] = mapped_column()
    col: Mapped[int] = mapped_column()
    clue: Mapped[str | None] = mapped_column(nullable=True)
    clue_status: Mapped[str] = mapped_column(default="pending")
    provenance: Mapped[str] = mapped_column(default="general-fill")

    puzzle: Mapped["Puzzle"] = relationship(back_populates="entries")


class WordlistEntry(Base):
    __tablename__ = "wordlist_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    word: Mapped[str] = mapped_column(unique=True)
    length: Mapped[int] = mapped_column()
    status: Mapped[str] = mapped_column(default="active")  # active | blocked


class WordpoolLemma(Base):
    # Curated lemma-only pool, distinct from the inflected-form wordlist_entries.
    # Populated from lemma datasets (UD_Georgian-GNC, simplemma). source records origin.
    __tablename__ = "wordpool_lemmas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    word: Mapped[str] = mapped_column(unique=True)
    length: Mapped[int] = mapped_column()
    source: Mapped[str] = mapped_column()  # "ud" | "simplemma" | "ud+simplemma"
    status: Mapped[str] = mapped_column(default="active")  # active | blocked


class WordCandidate(Base):
    __tablename__ = "word_candidates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    surface: Mapped[str] = mapped_column(unique=True)
    lemma: Mapped[str] = mapped_column()
    length: Mapped[int] = mapped_column()
    source_url: Mapped[str | None] = mapped_column(nullable=True)
    snippet: Mapped[str | None] = mapped_column(nullable=True)
    theme_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    status: Mapped[str] = mapped_column(default="offered")  # offered|accepted|edited|rejected


class ClueEvent(Base):
    __tablename__ = "clue_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("entries.id"))
    action: Mapped[str] = mapped_column()  # accept | edit | reject
    old_clue: Mapped[str | None] = mapped_column(nullable=True)
    new_clue: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column()  # "fill" | "scrape"
    puzzle_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(default="pending")  # pending|running|done|failed
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
