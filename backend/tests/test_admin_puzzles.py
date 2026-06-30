import uuid


def test_create_puzzle_returns_draft(client):
    resp = client.post("/api/admin/puzzles", json={"live_date": "2026-07-10"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert body["live_date"] == "2026-07-10"


def test_create_puzzle_without_date(client):
    # date guard removed: an empty body creates a draft with defaults.
    resp = client.post("/api/admin/puzzles", json={})
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert body["live_date"]  # defaults to today


def test_get_puzzle_returns_structure_and_entries(client, db_session):
    import datetime as dt
    from app.models import Entry, Puzzle

    p = Puzzle(
        id=uuid.uuid4(), live_date=dt.date(2026, 7, 11), 
        grid_template={"rows": 13, "cols": 13}, status="draft", seed=1, version=1,
    )
    p.entries.append(
        Entry(id=uuid.uuid4(), number=1, direction="across", answer="თბილისი",
              row=0, col=0, clue=None, clue_status="pending", provenance="sourced")
    )
    db_session.add(p)
    db_session.flush()

    body = client.get(f"/api/admin/puzzles/{p.id}").json()
    assert body["grid_template"]["rows"] == 13
    assert len(body["entries"]) == 1
    assert body["entries"][0]["answer"] == "თბილისი"


def test_get_unknown_puzzle_404(client):
    assert client.get(f"/api/admin/puzzles/{uuid.uuid4()}").status_code == 404
