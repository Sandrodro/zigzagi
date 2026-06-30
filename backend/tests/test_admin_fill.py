import datetime as dt
import uuid

from app.models import Job, Puzzle


def _draft(db):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 2), 
               grid_template={}, status="draft", seed=1, version=1)
    db.add(p)
    db.flush()
    return p


def test_fill_endpoint_enqueues_pending_job(client, db_session):
    p = _draft(db_session)
    db_session.flush()
    resp = client.post(f"/api/admin/puzzles/{p.id}/fill", json={"seed_value": 5, "min_seeds": 15})
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]
    job = db_session.get(Job, uuid.UUID(job_id))
    assert job.status == "pending" and job.kind == "fill"


def test_poll_unknown_job_404(client):
    assert client.get(f"/api/admin/jobs/{uuid.uuid4()}").status_code == 404
