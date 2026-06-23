import uuid

from app.models import WordpoolGeneric, WordpoolLemma
from app.worker import load_wordpool


def test_load_wordpool_selects_table(db_session):
    db_session.add(WordpoolGeneric(id=uuid.uuid4(), word="გენერალი", length=8, status="active"))
    db_session.add(WordpoolLemma(id=uuid.uuid4(), word="ლემა", length=4, source="ud", status="active"))
    db_session.flush()

    default_words = set(load_wordpool(db_session, "default").by_length(8))
    lemma_words = set(load_wordpool(db_session, "lemmas").by_length(4))

    assert "გენერალი" in default_words
    assert "ლემა" in lemma_words
    # pools are distinct sources
    assert "ლემა" not in set(load_wordpool(db_session, "default").by_length(4))


def test_load_wordpool_skips_blocked(db_session):
    db_session.add(WordpoolLemma(id=uuid.uuid4(), word="დაბლოკილი", length=9, source="ud", status="blocked"))
    db_session.flush()
    assert "დაბლოკილი" not in set(load_wordpool(db_session, "lemmas").by_length(9))
