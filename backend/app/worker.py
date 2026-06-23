import datetime as dt
import time
from collections.abc import Callable
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Job, Puzzle, WordpoolGeneric, WordpoolLemma
from app.services.publish import promote_due_puzzles
from app.services.puzzles import today_tbilisi
from app.services.seeds_provider import seeds_for_puzzle
from app.services.solver_jobs import run_fill_job
from app.solver.index import Wordlist
from app.solver.templates import Template, load_library

_LIB_DIR = Path(__file__).resolve().parent / "solver" / "templates"


def load_wordpool(db: Session, name: str = "default") -> Wordlist:
    # "lemmas" -> curated lemma-only pool; anything else -> the full wordpool_generic.
    table = WordpoolLemma if name == "lemmas" else WordpoolGeneric
    words = db.scalars(select(table.word).where(table.status == "active")).all()
    return Wordlist(list(words))


def load_active_wordlist(db: Session) -> Wordlist:
    return load_wordpool(db, "default")


def claim_next_fill_job(db: Session) -> Job | None:
    stmt = (
        select(Job)
        .where(Job.kind == "fill", Job.status == "pending")
        .order_by(Job.created_at)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    job = db.scalars(stmt).first()
    if job is not None:
        job.status = "running"
        db.flush()
    return job


def _seeds_for_job(db: Session, job: Job) -> list[str]:
    puzzle = db.get(Puzzle, job.puzzle_id) if job.puzzle_id else None
    return seeds_for_puzzle(db, puzzle) if puzzle else []


def tick(
    db: Session,
    library: list[Template],
    seeds_provider: Callable[[Session], list[str]] | None = None,
) -> bool:
    job = claim_next_fill_job(db)
    if job is None:
        return False
    seeds = seeds_provider(db) if seeds_provider else _seeds_for_job(db, job)
    wordlist = load_wordpool(db, job.params.get("wordpool", "default"))
    run_fill_job(db, job.id, library, seeds, wordlist)
    db.commit()
    return True


def promote_tick(db: Session, today: dt.date) -> int:
    n = promote_due_puzzles(db, today)
    db.commit()
    return n


def run_forever(poll_s: float = 2.0) -> None:  # pragma: no cover - operational entrypoint
    library = load_library(_LIB_DIR)
    last_promote = None
    while True:
        today = today_tbilisi()
        with SessionLocal() as db:
            if today != last_promote:
                promote_tick(db, today)
                last_promote = today
            did = tick(db, library)
        if not did:
            time.sleep(poll_s)


if __name__ == "__main__":  # pragma: no cover
    run_forever()
