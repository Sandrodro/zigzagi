# backend/tests/test_admin_word_check.py
import datetime as dt
import uuid

from app.ai.client import WordCheck
from app.main import app
from app.models import Entry, Puzzle
from app.routers.admin import get_gemini


class FakeAI:
    def __init__(self, verdicts): self.verdicts = verdicts
    def check_word(self, word, pattern, length): return self.verdicts.get(word, WordCheck(valid=True))


def _seed(db):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), 
               grid_template={}, status="draft", seed=None, version=1)
    db.add(p); db.flush()
    e = Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="across",
              answer="დედა", row=0, col=0, clue=None, clue_status="pending", provenance="manual")
    db.add(e); db.flush()
    return p, e


def test_check_entry_endpoint(client, db_session):
    p, e = _seed(db_session)
    app.dependency_overrides[get_gemini] = lambda: FakeAI({"დედა": WordCheck(valid=False, replacement="დ___".replace("_", "ა"))})
    try:
        res = client.post(f"/api/admin/puzzles/{p.id}/entries/{e.id}/check")
        assert res.status_code == 200
        body = res.json()
        assert body["valid"] is False
    finally:
        app.dependency_overrides.pop(get_gemini, None)


def test_check_words_endpoint(client, db_session):
    p, _ = _seed(db_session)
    app.dependency_overrides[get_gemini] = lambda: FakeAI({})  # all valid
    try:
        res = client.post(f"/api/admin/puzzles/{p.id}/check-words")
        assert res.status_code == 200
        assert res.json()["checked"] == 1
    finally:
        app.dependency_overrides.pop(get_gemini, None)
