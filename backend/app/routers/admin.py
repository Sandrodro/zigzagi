import datetime as dt
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.client import GeminiClient
from app.ai.gemini import GeminiExtractor
from app.db import get_db
from app.models import Job, Puzzle
from app.services.clues import generate_clues, review_clue
from app.services.pool import bulk_update, create_from_extraction, list_pool
from app.services.publish import runway_days, schedule_puzzle
from app.services.puzzles import today_tbilisi
from app.services.solver_jobs import enqueue_fill, list_template_dtos
from app.services.wordlist import (
    add_word,
    bulk_import,
    list_words,
    stats,
    update_entry,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def get_gemini() -> GeminiClient:  # overridden in tests
    return GeminiExtractor(
        api_key=os.environ["GEMINI_API_KEY"],
        extract_model=os.environ.get("GEMINI_EXTRACT_MODEL", "gemini-2.5-flash"),
        suggest_model=os.environ.get("GEMINI_SUGGEST_MODEL", "gemini-2.5-flash"),
        clue_model=os.environ.get("GEMINI_CLUE_MODEL", "gemini-2.5-pro"),
    )


@router.get("/templates")
def templates():
    return list_template_dtos()


class FillRequest(BaseModel):
    seed_value: int = 0
    min_seeds: int = 10
    template_id: str | None = None
    prefilled: dict[str, str] = {}


@router.post("/puzzles/{puzzle_id}/fill", status_code=202)
def request_fill(puzzle_id: uuid.UUID, body: FillRequest, db: Session = Depends(get_db)):
    if db.get(Puzzle, puzzle_id) is None:
        raise HTTPException(404, "puzzle not found")
    job = enqueue_fill(db, puzzle_id, body.seed_value, body.min_seeds,
                       template_id=body.template_id, prefilled=body.prefilled)
    db.commit()
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


class WordlistAddRequest(BaseModel):
    word: str


class WordlistUpdateRequest(BaseModel):
    word: str | None = None
    status: str | None = None


class WordlistBulkRequest(BaseModel):
    text: str


def _wordlist_row(r) -> dict:
    return {"id": str(r.id), "word": r.word, "length": r.length, "status": r.status}


@router.get("/wordlist")
def wordlist_list(
    status: str | None = None,
    length: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    return [_wordlist_row(r) for r in list_words(db, status, length, search)]


@router.get("/wordlist/stats")
def wordlist_stats(db: Session = Depends(get_db)):
    return stats(db)


@router.post("/wordlist", status_code=201)
def wordlist_add(body: WordlistAddRequest, db: Session = Depends(get_db)):
    try:
        row = add_word(db, body.word)
    except ValueError as e:
        raise HTTPException(422, str(e))
    db.commit()
    return _wordlist_row(row)


@router.patch("/wordlist/{entry_id}")
def wordlist_update(entry_id: uuid.UUID, body: WordlistUpdateRequest, db: Session = Depends(get_db)):
    try:
        row = update_entry(db, entry_id, word=body.word, status=body.status)
    except ValueError as e:
        if str(e) == "not found":
            raise HTTPException(404, "wordlist entry not found")
        raise HTTPException(422, str(e))
    db.commit()
    return _wordlist_row(row)


@router.post("/wordlist/bulk")
def wordlist_bulk(body: WordlistBulkRequest, db: Session = Depends(get_db)):
    result = bulk_import(db, body.text.split())
    db.commit()
    return result


class CreatePuzzleRequest(BaseModel):
    theme: str
    live_date: dt.date


@router.post("/puzzles", status_code=201)
def create_puzzle(body: CreatePuzzleRequest, db: Session = Depends(get_db)):
    puzzle = Puzzle(
        id=uuid.uuid4(), live_date=body.live_date, theme=body.theme,
        grid_template={}, status="draft", seed=None, version=1,
    )
    db.add(puzzle)
    db.commit()
    return {
        "id": str(puzzle.id), "theme": puzzle.theme,
        "live_date": puzzle.live_date.isoformat(), "status": puzzle.status,
    }


class ClueReviewRequest(BaseModel):
    action: str
    clue: str | None = None


@router.post("/puzzles/{puzzle_id}/clues")
def gen_clues(puzzle_id: uuid.UUID, db: Session = Depends(get_db), ai: GeminiClient = Depends(get_gemini)):
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise HTTPException(404, "puzzle not found")
    n = generate_clues(db, puzzle, ai)
    db.commit()
    return {"generated": n}


@router.patch("/puzzles/{puzzle_id}/clues/{entry_id}")
def review(puzzle_id: uuid.UUID, entry_id: uuid.UUID, body: ClueReviewRequest, db: Session = Depends(get_db), ai: GeminiClient = Depends(get_gemini)):
    entry = review_clue(db, entry_id, body.action, body.clue, ai=ai)
    db.commit()
    return {"clue_status": entry.clue_status}


class ScheduleRequest(BaseModel):
    live_date: dt.date


@router.post("/puzzles/{puzzle_id}/schedule")
def schedule(puzzle_id: uuid.UUID, body: ScheduleRequest, db: Session = Depends(get_db)):
    if db.get(Puzzle, puzzle_id) is None:
        raise HTTPException(404, "puzzle not found")
    try:
        puzzle = schedule_puzzle(db, puzzle_id, body.live_date)  # raises ValueError if not publishable
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "another puzzle is already scheduled for that date")
    return {"status": puzzle.status, "live_date": puzzle.live_date.isoformat()}


@router.get("/dashboard/runway")
def runway(db: Session = Depends(get_db)):
    days = runway_days(db, today_tbilisi())
    return {"runway_days": days, "warning": days < 7}


@router.get("/puzzles/{puzzle_id}")
def get_puzzle(puzzle_id: uuid.UUID, db: Session = Depends(get_db)):
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise HTTPException(404, "puzzle not found")
    return {
        "id": str(puzzle.id), "theme": puzzle.theme,
        "live_date": puzzle.live_date.isoformat(), "status": puzzle.status,
        "grid_template": puzzle.grid_template,
        "entries": [
            {
                "id": str(e.id), "number": e.number, "direction": e.direction,
                "answer": e.answer, "row": e.row, "col": e.col,
                "clue": e.clue, "clue_status": e.clue_status, "provenance": e.provenance,
            }
            for e in puzzle.entries
        ],
    }
