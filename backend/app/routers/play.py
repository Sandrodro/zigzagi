import datetime as dt

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
        {"date": p.live_date.isoformat(), "theme": p.theme, "status": p.status}
        for p in svc.list_published(db)
    ]


def _require_puzzle(db: Session, date_str: str):
    try:
        on_date = dt.date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid date")
    puzzle = svc.get_published_puzzle(db, on_date)
    if puzzle is None:
        raise HTTPException(status_code=404, detail="no puzzle for date")
    return puzzle


@router.post("/puzzles/{date}/check")
def check(date: str, payload: CheckRequest, db: Session = Depends(get_db)):
    puzzle = _require_puzzle(db, date)
    amap = svc.build_answer_map(puzzle)
    results = [
        {"row": c.row, "col": c.col, "correct": amap.get((c.row, c.col)) == c.value}
        for c in payload.cells
    ]
    return {"results": results}


@router.post("/puzzles/{date}/reveal")
def reveal(date: str, payload: RevealRequest, db: Session = Depends(get_db)):
    puzzle = _require_puzzle(db, date)
    amap = svc.build_answer_map(puzzle)
    cells = [
        {"row": c.row, "col": c.col, "value": amap[(c.row, c.col)]}
        for c in payload.cells
        if (c.row, c.col) in amap
    ]
    return {"cells": cells}


@router.get("/puzzles/{date}")
def get_by_date(date: str, db: Session = Depends(get_db)):
    return svc.to_play_dto(_require_puzzle(db, date))
