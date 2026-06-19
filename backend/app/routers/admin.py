import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Job, Puzzle
from app.services.solver_jobs import enqueue_fill

router = APIRouter(prefix="/api/admin", tags=["admin"])


class FillRequest(BaseModel):
    seed_value: int = 0
    min_seeds: int = 15


@router.post("/puzzles/{puzzle_id}/fill", status_code=202)
def request_fill(puzzle_id: uuid.UUID, body: FillRequest, db: Session = Depends(get_db)):
    if db.get(Puzzle, puzzle_id) is None:
        raise HTTPException(404, "puzzle not found")
    job = enqueue_fill(db, puzzle_id, body.seed_value, body.min_seeds)
    return {"job_id": str(job.id)}


@router.get("/jobs/{job_id}")
def poll_job(job_id: uuid.UUID, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    return {"status": job.status, "result": job.result, "error": job.error}
