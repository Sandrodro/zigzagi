import datetime as dt
import uuid

from app.models import Job, Puzzle
from app.services.solver_jobs import enqueue_fill, persist_freeform, run_fill_job
from app.solver.freeform import FreeformResult
from app.solver.run import FilledEntry
from app.solver.index import Wordlist


def _draft(db):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), theme="t",
               grid_template={}, status="draft", seed=7, version=1)
    db.add(p)
    db.flush()
    return p


def test_persist_freeform_writes_template_and_entries(db_session):
    p = _draft(db_session)
    res = FreeformResult(
        rows=3, cols=3, blocks=[(2, 2)],
        grid={(0, 0): "c", (0, 1): "a", (0, 2): "t", (1, 0): "a", (2, 0): "r"},
        entries=[
            FilledEntry(1, "across", 0, 0, "cat", "freeform"),
            FilledEntry(1, "down", 0, 0, "car", "freeform"),
        ],
        density=0.5,
    )
    persist_freeform(db_session, p.id, res)
    db_session.flush()
    reloaded = db_session.get(Puzzle, p.id)
    assert reloaded.grid_template["rows"] == 3
    assert reloaded.grid_template["blocks"] == [[2, 2]]
    assert sorted(e.answer for e in reloaded.entries) == ["car", "cat"]
    assert all(e.provenance == "freeform" for e in reloaded.entries)


def test_run_fill_job_freeform_branch_persists(db_session):
    p = _draft(db_session)
    words = ["cart", "care", "core", "rope", "race", "rate", "acre", "earn",
             "near", "neat", "tend", "send", "sane", "lane", "land", "cane"]
    job = enqueue_fill(db_session, p.id, seed_value=1, min_seeds=0,
                       mode="freeform", word_count=8)
    db_session.flush()
    run_fill_job(db_session, job.id, library=[], seeds=[], wordlist=Wordlist(words))
    db_session.flush()
    reloaded = db_session.get(Job, job.id)
    assert reloaded.status == "done"
    assert db_session.get(Puzzle, p.id).entries
