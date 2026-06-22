import datetime as dt
import uuid

from app.ai.client import ClueResult
from app.ai.fakes import FakeGeminiClient
from app.main import app
from app.models import Entry, Puzzle
from app.routers.admin import get_gemini


def _seed(db):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 8, 1), theme="თბილისი", grid_template={}, status="draft", seed=1, version=1)
    e = Entry(id=uuid.uuid4(), number=1, direction="across", answer="თბილისი", row=0, col=0, clue=None, clue_status="pending", provenance="sourced")
    p.entries.append(e)
    db.add(p)
    db.flush()
    return p, e


def test_generate_then_accept(client, db_session):
    p, e = _seed(db_session)
    app.dependency_overrides[get_gemini] = lambda: FakeGeminiClient(
        clue_return=[ClueResult(entry_id=str(e.id), clue="საქართველოს დედაქალაქი")]
    )

    resp = client.post(f"/api/admin/puzzles/{p.id}/clues")
    assert resp.status_code == 200 and resp.json() == {"generated": 1}

    resp = client.patch(f"/api/admin/puzzles/{p.id}/clues/{e.id}", json={"action": "accept"})
    assert resp.status_code == 200 and resp.json() == {"clue_status": "accepted"}

    app.dependency_overrides.pop(get_gemini, None)
