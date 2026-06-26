import datetime as dt
import uuid

from app.models import Job, Puzzle


def _draft(db):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), theme="t",
               grid_template={}, status="draft", seed=1, version=1)
    db.add(p)
    db.flush()
    return p


def test_fill_request_enqueues_freeform_job(client, db_session):
    p = _draft(db_session)
    db_session.commit()
    r = client.post(f"/api/admin/puzzles/{p.id}/fill",
                    json={"mode": "freeform", "word_count": 24, "wordpool": "lemmas"})
    assert r.status_code == 202
    job = db_session.query(Job).filter(Job.puzzle_id == p.id).one()
    assert job.params["mode"] == "freeform"
    assert job.params["word_count"] == 24
    assert job.params["wordpool"] == "lemmas"
