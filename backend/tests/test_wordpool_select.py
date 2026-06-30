import uuid

from app.models import WordpoolLemma
from app.worker import load_wordpool


def test_load_wordpool_loads_active_lemmas(db_session):
    db_session.add(WordpoolLemma(id=uuid.uuid4(), word="ლემა", length=4, source="ud", status="active"))
    db_session.flush()
    assert "ლემა" in set(load_wordpool(db_session).by_length(4))


def test_load_wordpool_skips_blocked(db_session):
    db_session.add(WordpoolLemma(id=uuid.uuid4(), word="დაბლოკილი", length=9, source="ud", status="blocked"))
    db_session.flush()
    assert "დაბლოკილი" not in set(load_wordpool(db_session).by_length(9))
