from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import puzzles as svc

router = APIRouter(prefix="/api/play", tags=["play"])


@router.get("/puzzles/today")
def get_today(db: Session = Depends(get_db)):
    puzzle = svc.get_published_puzzle(db, svc.today_tbilisi())
    if puzzle is None:
        raise HTTPException(status_code=404, detail="no puzzle for today")
    return svc.to_play_dto(puzzle)
