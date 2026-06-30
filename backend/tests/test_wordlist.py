import uuid

import pytest

from app.models import WordpoolLemma
from app.services.wordlist import add_word, bulk_import, list_words, stats, update_entry


def test_add_word_validates_and_inserts(db_session):
    row = add_word(db_session, "თბილისი")
    db_session.flush()
    assert row.length == 7 and row.status == "active"


def test_add_word_rejects_non_georgian(db_session):
    with pytest.raises(ValueError, match="non-georgian"):
        add_word(db_session, "abc")


def test_add_word_dedupes(db_session):
    a = add_word(db_session, "თბილისი")
    b = add_word(db_session, "თბილისი")
    db_session.flush()
    assert a.id == b.id


def test_update_entry_blocks_and_unblocks(db_session):
    row = add_word(db_session, "თბილისი")
    db_session.flush()
    update_entry(db_session, row.id, status="blocked")
    db_session.flush()
    assert row.status == "blocked"
    update_entry(db_session, row.id, status="active")
    db_session.flush()
    assert row.status == "active"


def test_update_entry_rejects_bad_status(db_session):
    row = add_word(db_session, "თბილისი")
    db_session.flush()
    with pytest.raises(ValueError, match="invalid status"):
        update_entry(db_session, row.id, status="zombie")


def test_bulk_import_counts_and_rejects(db_session):
    result = bulk_import(db_session, ["თბილისი", "ბათუმი", "ab", "თბილისი"])
    db_session.flush()
    assert result["added"] == 2  # two valid uniques; "ab" rejected, dup skipped
    reasons = {r["word"]: r["reason"] for r in result["rejected"]}
    assert reasons == {"ab": "length<3"}


def test_list_filters_by_status_and_search(db_session):
    add_word(db_session, "თბილისი")
    blocked = add_word(db_session, "ბათუმი")
    db_session.flush()
    update_entry(db_session, blocked.id, status="blocked")
    db_session.flush()
    assert [w.word for w in list_words(db_session, status="active")] == ["თბილისი"]
    assert [w.word for w in list_words(db_session, search="ბათ")] == ["ბათუმი"]


def test_stats_zero_fills_all_lengths(db_session):
    add_word(db_session, "აბგ")        # length 3
    add_word(db_session, "თბილისი")    # length 7
    db_session.flush()
    s = stats(db_session)
    assert s["active"] == 2 and s["blocked"] == 0
    assert s["by_length"][3] == 1 and s["by_length"][7] == 1
    assert s["by_length"][4] == 0
    assert set(s["by_length"].keys()) == set(range(3, 14))
