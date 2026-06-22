import datetime as dt
import uuid
from pathlib import Path

from app.models import Job, Puzzle
from app.services.solver_jobs import enqueue_fill, persist_fill, run_fill_job
from app.solver.index import Wordlist
from app.solver.run import FilledEntry, FillResult
from app.solver.templates import load_library

_LIB = Path(__file__).resolve().parents[1] / "app" / "solver" / "templates"


def _draft(db):
    p = Puzzle(
        id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), theme="t",
        grid_template={}, status="draft", seed=7, version=1,
    )
    db.add(p)
    db.flush()
    return p


def test_persist_fill_writes_entries_and_template(db_session):
    p = _draft(db_session)
    result = FillResult(
        template_id="10x10-001",
        grid={(0, 0): "ა", (0, 1): "ბ", (0, 2): "გ"},
        entries=[FilledEntry(1, "across", 0, 0, "აბგ", "sourced")],
    )
    persist_fill(db_session, p.id, result)
    db_session.flush()
    reloaded = db_session.get(Puzzle, p.id)
    assert reloaded.grid_template["rows"] == 10
    assert len(reloaded.entries) == 1
    assert reloaded.entries[0].provenance == "sourced"
    assert reloaded.entries[0].clue_status == "pending"


def test_run_fill_job_marks_failed_with_reason(db_session):
    p = _draft(db_session)
    job = enqueue_fill(db_session, p.id, seed_value=1, min_seeds=99)  # impossible -> fail
    db_session.flush()
    run_fill_job(db_session, job.id, load_library(_LIB), seeds=["აბგ"], wordlist=Wordlist(["აბგ"]))
    db_session.flush()
    reloaded = db_session.get(Job, job.id)
    assert reloaded.status == "failed"
    assert reloaded.error
