import datetime as dt

from app.seed import seed_demo_puzzle


def test_reveal_returns_correct_letters(client, db_session):
    seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 18))
    db_session.flush()
    payload = {"cells": [{"row": 0, "col": 0}, {"row": 1, "col": 0}]}
    response = client.post("/api/play/puzzles/2026-06-18/reveal", json=payload)
    assert response.status_code == 200
    cells = response.json()["cells"]
    assert {"row": 0, "col": 0, "value": "ა"} in cells
    assert {"row": 1, "col": 0, "value": "ვ"} in cells
