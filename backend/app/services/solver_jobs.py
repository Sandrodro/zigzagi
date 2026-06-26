import logging
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Entry, Job, Puzzle
from app.solver.freeform import FreeformResult, construct
from app.solver.index import Wordlist
from app.solver.model import build_constraints
from app.solver.numbering import number_cells
from app.solver.run import FillFailure, FillResult, fill
from app.solver.templates import Template, load_library, pick_template

_LIB_DIR = Path(__file__).resolve().parents[1] / "solver" / "templates"
log = logging.getLogger(__name__)


def _template_by_id(template_id: str) -> Template:
    for t in load_library(_LIB_DIR):
        if t.id == template_id:
            return t
    raise ValueError(f"unknown template {template_id}")


def grid_template_from(template: Template) -> dict:
    nums = number_cells(template)
    cells = [
        {"row": r, "col": c, "number": n}
        for (r, c), n in sorted(nums.items(), key=lambda kv: kv[1])
    ]
    return {
        "rows": template.rows,
        "cols": template.cols,
        "blocks": sorted([r, c] for (r, c) in template.blocks),
        "cells": cells,
    }


def persist_fill(db: Session, puzzle_id: uuid.UUID, result: FillResult) -> None:
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise ValueError("puzzle not found")
    template = _template_by_id(result.template_id)
    puzzle.grid_template = grid_template_from(template)
    for fe in result.entries:
        puzzle.entries.append(
            Entry(
                id=uuid.uuid4(),
                number=fe.number,
                direction=fe.direction,
                answer=fe.answer,
                row=fe.row,
                col=fe.col,
                clue=None,
                clue_status="pending",
                provenance=fe.provenance,
            )
        )
    db.flush()


def persist_freeform(db: Session, puzzle_id: uuid.UUID, result: FreeformResult) -> None:
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise ValueError("puzzle not found")
    template = Template(id="freeform", rows=result.rows, cols=result.cols,
                        blocks=frozenset(tuple(b) for b in result.blocks))
    puzzle.grid_template = grid_template_from(template)
    for fe in result.entries:
        puzzle.entries.append(
            Entry(
                id=uuid.uuid4(), number=fe.number, direction=fe.direction,
                answer=fe.answer, row=fe.row, col=fe.col,
                clue=None, clue_status="pending", provenance=fe.provenance,
            )
        )
    db.flush()


def list_template_dtos() -> list[dict]:
    out = []
    for t in load_library(_LIB_DIR):
        slots = []
        for con in build_constraints(t):
            r0, c0 = con.cells[0]
            slots.append({
                "number": con.number,
                "direction": con.direction,
                "row": r0,
                "col": c0,
                "length": con.length,
            })
        out.append({
            "id": t.id,
            "rows": t.rows,
            "cols": t.cols,
            "blocks": sorted([r, c] for (r, c) in t.blocks),
            "slots": slots,
        })
    return out


def enqueue_fill(
    db: Session,
    puzzle_id: uuid.UUID,
    seed_value: int,
    min_seeds: int,
    template_id: str | None = None,
    prefilled: dict[str, str] | None = None,
    wordpool: str = "default",
    mode: str = "normal",
    word_count: int = 28,
    target_density: float = 0.6,
) -> Job:
    job = Job(
        id=uuid.uuid4(), kind="fill", puzzle_id=puzzle_id, status="pending",
        params={
            "seed_value": seed_value,
            "min_seeds": min_seeds,
            "template_id": template_id,
            "prefilled": prefilled or {},
            "wordpool": wordpool,
            "mode": mode,
            "word_count": word_count,
            "target_density": target_density,
        },
    )
    db.add(job)
    db.flush()
    return job


def run_fill_job(
    db: Session, job_id: uuid.UUID, library: list[Template], seeds: list[str], wordlist: Wordlist
) -> Job:
    job = db.get(Job, job_id)
    job.status = "running"
    db.flush()
    if job.params.get("mode") == "freeform":
        word_count = job.params.get("word_count", 28)
        outcome = construct(
            wordlist, job.params["seed_value"],
            target_words=word_count,
            target_density=job.params.get("target_density", 0.6),
            # floor at 20 for real puzzles, but never demand more than asked.
            min_words=min(word_count, 20),
        )
        if isinstance(outcome, FreeformResult):
            persist_freeform(db, job.puzzle_id, outcome)
            job.status = "done"
            job.result = {"mode": "freeform", "entries": len(outcome.entries),
                          "density": round(outcome.density, 3)}
            log.info("freeform done: puzzle=%s job=%s entries=%d density=%.2f",
                     job.puzzle_id, job.id, len(outcome.entries), outcome.density)
        else:
            job.status = "failed"
            job.error = outcome.reason
            log.warning("freeform failed: puzzle=%s job=%s reason=%s",
                        job.puzzle_id, job.id, outcome.reason)
        db.flush()
        return job
    tid = job.params.get("template_id")
    if tid:
        template = next((t for t in library if t.id == tid), None)
        if template is None:  # requested a template that isn't in the library — don't silently substitute
            job.status = "failed"
            job.error = f"template not found: {tid}"
            log.warning("fill failed: puzzle=%s job=%s template not found: %s", job.puzzle_id, job.id, tid)
            db.flush()
            return job
    else:
        template = pick_template(library, job.params["seed_value"])
    log.info("fill start: puzzle=%s job=%s template=%s seeds=%d wordlist=%d",
             job.puzzle_id, job.id, template.id, len(seeds), len(wordlist))
    outcome = fill(
        template, seeds, wordlist,
        seed_value=job.params["seed_value"], min_seeds=job.params["min_seeds"],
        prefilled=job.params.get("prefilled") or {},
        deadline_s=30.0,
    )
    if isinstance(outcome, FillFailure):
        job.status = "failed"
        job.error = outcome.reason
        log.warning("fill failed: puzzle=%s job=%s reason=%s", job.puzzle_id, job.id, outcome.reason)
    else:
        persist_fill(db, job.puzzle_id, outcome)
        job.status = "done"
        job.result = {"template_id": outcome.template_id, "entries": len(outcome.entries)}
        log.info("fill done: puzzle=%s job=%s template=%s entries=%d",
                 job.puzzle_id, job.id, outcome.template_id, len(outcome.entries))
    db.flush()
    return job
