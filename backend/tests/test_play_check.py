import datetime as dt
import json
import uuid

from app.seed import seed_demo_puzzle


def test_check_marks_cells_correct_and_incorrect(client, db_session):
    p = seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 18))
    db_session.flush()
    # (0,0) is "ა" in the fixture. Send one right, one wrong.
    payload = {"cells": [
        {"row": 0, "col": 0, "value": "ა"},
        {"row": 0, "col": 1, "value": " z"},
    ]}
    response = client.post(f"/api/play/puzzles/by-id/{p.id}/check", json=payload)
    assert response.status_code == 200
    results = response.json()["results"]
    assert {"row": 0, "col": 0, "correct": True} in results
    assert {"row": 0, "col": 1, "correct": False} in results
    # The correct letter for the wrong cell ("ბ") must not leak.
    assert "ბ" not in json.dumps(response.json())


def test_check_404_for_missing_id(client, db_session):
    response = client.post(
        f"/api/play/puzzles/by-id/{uuid.uuid4()}/check", json={"cells": []}
    )
    assert response.status_code == 404
