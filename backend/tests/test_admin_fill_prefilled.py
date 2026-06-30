import uuid

from app.models import Puzzle
from app.services.solver_jobs import enqueue_fill


def test_enqueue_fill_stores_template_and_prefilled(db_session):
    p = Puzzle(id=uuid.uuid4(), live_date=__import__("datetime").date(2026, 7, 1),
               grid_template={}, status="draft", seed=None, version=1)
    db_session.add(p)
    db_session.flush()
    job = enqueue_fill(db_session, p.id, seed_value=0, min_seeds=0,
                       template_id="11x11-001", prefilled={"1A": "დედა"})
    assert job.params["template_id"] == "11x11-001"
    assert job.params["prefilled"] == {"1A": "დედა"}
    assert job.params["min_seeds"] == 0
