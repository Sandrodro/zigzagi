import datetime as dt
import uuid
from pathlib import Path

from app.models import Job, Puzzle, WordpoolLemma
from app.services.solver_jobs import enqueue_fill
from app.solver.templates import load_library
from app.worker import load_active_wordlist, tick

_LIB = load_library(Path(__file__).resolve().parents[1] / "app" / "solver" / "templates")


def test_load_active_wordlist_excludes_blocked(db_session):
    db_session.add(WordpoolLemma(id=uuid.uuid4(), word="აბგ", length=3, source="manual", status="active"))
    db_session.add(WordpoolLemma(id=uuid.uuid4(), word="ბად", length=3, source="manual", status="blocked"))
    db_session.flush()
    wl = load_active_wordlist(db_session)
    assert wl.by_length(3) == ["აბგ"]


def test_tick_processes_one_pending_job(db_session):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 3), 
               grid_template={}, status="draft", seed=1, version=1)
    db_session.add(p)
    enqueue_fill(db_session, p.id, seed_value=1, min_seeds=99)  # will fail fast
    db_session.flush()
    did = tick(db_session, _LIB, seeds_provider=lambda db: ["აბგ"])
    assert did is True
    job = db_session.query(Job).filter_by(puzzle_id=p.id).one()
    assert job.status in ("done", "failed")
