import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import CheckRequest, RevealRequest
from app.services import puzzles as svc

router = APIRouter(prefix="/api/play", tags=["play"])


@router.get("/puzzles/today")
def get_today(db: Session = Depends(get_db)):
    puzzle = svc.get_published_puzzle(db, svc.today_tbilisi())
    if puzzle is None:
        raise HTTPException(status_code=404, detail="no puzzle for today")
    return svc.to_play_dto(puzzle)


@router.get("/puzzles")
def list_puzzles(db: Session = Depends(get_db)):
    return [
        {"id": str(p.id), "date": p.live_date.isoformat(), "theme": p.theme, "status": p.status}
        for p in svc.list_published(db)
    ]


def _require_by_id(db: Session, id_str: str):
    try:
        puzzle_id = uuid.UUID(id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    puzzle = svc.get_published_by_id(db, puzzle_id)
    if puzzle is None:
        raise HTTPException(status_code=404, detail="no published puzzle for id")
    return puzzle


@router.get("/puzzles/by-id/{puzzle_id}")
def get_by_id(puzzle_id: str, db: Session = Depends(get_db)):
    return svc.to_play_dto(_require_by_id(db, puzzle_id))


@router.post("/puzzles/by-id/{puzzle_id}/check")
def check(puzzle_id: str, payload: CheckRequest, db: Session = Depends(get_db)):
    puzzle = _require_by_id(db, puzzle_id)
    amap = svc.build_answer_map(puzzle)
    results = [
        {"row": c.row, "col": c.col, "correct": amap.get((c.row, c.col)) == c.value}
        for c in payload.cells
    ]
    return {"results": results}


@router.post("/puzzles/by-id/{puzzle_id}/reveal")
def reveal(puzzle_id: str, payload: RevealRequest, db: Session = Depends(get_db)):
    puzzle = _require_by_id(db, puzzle_id)
    amap = svc.build_answer_map(puzzle)
    cells = [
        {"row": c.row, "col": c.col, "value": amap[(c.row, c.col)]}
        for c in payload.cells
        if (c.row, c.col) in amap
    ]
    return {"cells": cells}


@router.get("/puzzles/{date}")
def get_by_date(date: str, db: Session = Depends(get_db)):
    try:
        on_date = dt.date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid date")
    puzzle = svc.get_published_puzzle(db, on_date)
    if puzzle is None:
        raise HTTPException(status_code=404, detail="no puzzle for date")
    return svc.to_play_dto(puzzle)
