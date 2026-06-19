import time
from collections.abc import Callable
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Job, WordlistEntry
from app.services.solver_jobs import run_fill_job
from app.solver.index import Wordlist
from app.solver.templates import Template, load_library

_LIB_DIR = Path(__file__).resolve().parent / "solver" / "templates"


def load_active_wordlist(db: Session) -> Wordlist:
    words = db.scalars(select(WordlistEntry.word).where(WordlistEntry.status == "active")).all()
    return Wordlist(list(words))


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


def tick(db: Session, library: list[Template], seeds_provider: Callable[[Session], list[str]]) -> bool:
    job = claim_next_fill_job(db)
    if job is None:
        return False
    seeds = seeds_provider(db)
    wordlist = load_active_wordlist(db)
    run_fill_job(db, job.id, library, seeds, wordlist)
    db.commit()
    return True


def run_forever(poll_s: float = 2.0) -> None:  # pragma: no cover - operational entrypoint
    library = load_library(_LIB_DIR)
    while True:
        with SessionLocal() as db:
            did = tick(db, library, seeds_provider=lambda _db: [])
        if not did:
            time.sleep(poll_s)


if __name__ == "__main__":  # pragma: no cover
    run_forever()
