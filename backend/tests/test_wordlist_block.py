from app.services.wordlist import add_word, block_word, list_words


def test_block_existing_word(db_session):
    add_word(db_session, "დედანი")
    row = block_word(db_session, "დედანი")
    assert row.status == "blocked"
    assert [w.word for w in list_words(db_session, status="active")] == []


def test_block_absent_word_inserts_blocked(db_session):
    row = block_word(db_session, "ზზზზზ")
    assert row.status == "blocked"
    assert row.length == 5
