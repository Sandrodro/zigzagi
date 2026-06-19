import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai.client import GeminiClient
from app.ai.gemini import GeminiExtractor
from app.db import get_db
from app.models import Job, Puzzle
from app.services.pool import bulk_update, create_from_extraction, list_pool
from app.services.solver_jobs import enqueue_fill

router = APIRouter(prefix="/api/admin", tags=["admin"])


def get_gemini() -> GeminiClient:  # overridden in tests
    return GeminiExtractor(
        api_key=os.environ["GEMINI_API_KEY"],
        extract_model=os.environ.get("GEMINI_EXTRACT_MODEL", "gemini-2.5-flash"),
        suggest_model=os.environ.get("GEMINI_SUGGEST_MODEL", "gemini-2.5-flash"),
    )


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


class ExtractRequest(BaseModel):
    text: str
    theme: str


class BulkRequest(BaseModel):
    ops: list[dict]


class SuggestRequest(BaseModel):
    theme: str


@router.post("/extract")
def extract(body: ExtractRequest, db: Session = Depends(get_db), ai: GeminiClient = Depends(get_gemini)):
    pool = [r.surface for r in list_pool(db, status="accepted")]
    candidates = ai.extract(body.text, body.theme, pool)
    rows, dropped = create_from_extraction(db, candidates, body.theme)
    db.commit()
    return {
        "dropped_count": dropped,
        "candidates": [
            {"id": str(r.id), "surface": r.surface, "lemma": r.lemma, "length": r.length, "snippet": r.snippet}
            for r in rows
        ],
    }


@router.get("/pool")
def pool(status: str | None = None, theme: str | None = None, db: Session = Depends(get_db)):
    return [
        {"id": str(r.id), "surface": r.surface, "length": r.length, "status": r.status, "snippet": r.snippet}
        for r in list_pool(db, status, theme)
    ]


@router.patch("/pool/bulk")
def pool_bulk(body: BulkRequest, db: Session = Depends(get_db)):
    n = bulk_update(db, body.ops)
    db.commit()
    return {"updated": n}


@router.post("/suggest")
def suggest(body: SuggestRequest, db: Session = Depends(get_db), ai: GeminiClient = Depends(get_gemini)):
    pool_words = [r.surface for r in list_pool(db, status="accepted")]
    return [s.model_dump() for s in ai.suggest(body.theme, pool_words)]
