import datetime as dt

from app.seed import seed_demo_puzzle


def test_bundle_includes_dto_and_solution(client, db_session):
    p = seed_demo_puzzle(db_session, live_date=dt.date(2026, 7, 6))
    db_session.flush()
    response = client.get(f"/api/play/puzzles/by-id/{p.id}/bundle")
    assert response.status_code == 200
    body = response.json()
    # normal play-DTO fields still present
    assert body["id"] == str(p.id)
    assert body["clues"]["across"]
    assert body["cells"]
    # plus the solution
    assert {"row": 0, "col": 0, "value": "ა"} in body["solution"]
    assert {"row": 1, "col": 0, "value": "ვ"} in body["solution"]


def test_bundle_404_for_unknown_id(client):
    response = client.get(
        "/api/play/puzzles/by-id/00000000-0000-0000-0000-000000000000/bundle"
    )
    assert response.status_code == 404
