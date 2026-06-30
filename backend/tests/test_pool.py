from app.ai.client import ExtractedCandidate
from app.services.pool import bulk_update, create_from_extraction, list_pool


def _cand(surface, length=None):
    return ExtractedCandidate(surface=surface, lemma=surface, length=length or len(surface), snippet="s", theme_relevance=0.8)


def test_create_revalidates_and_dedupes(db_session):
    rows, dropped = create_from_extraction(
        db_session,
        [_cand("თბილისი"), _cand("ab"), _cand("თბილისი")],  # latin dropped, dup dropped
        
    )
    db_session.flush()
    assert {r.surface for r in rows} == {"თბილისი"}
    assert dropped == 2
    assert rows[0].status == "offered"


def test_bulk_accept_and_reject(db_session):
    rows, _ = create_from_extraction(db_session, [_cand("თბილისი"), _cand("მთაწმინდა")])
    db_session.flush()
    n = bulk_update(db_session, [
        {"id": str(rows[0].id), "action": "accept"},
        {"id": str(rows[1].id), "action": "reject"},
    ])
    db_session.flush()
    assert n == 2
    assert {r.status for r in list_pool(db_session)} == {"accepted", "rejected"}


def test_list_filters_by_status(db_session):
    rows, _ = create_from_extraction(db_session, [_cand("თბილისი")])
    db_session.flush()
    bulk_update(db_session, [{"id": str(rows[0].id), "action": "accept"}])
    db_session.flush()
    assert len(list_pool(db_session, status="accepted")) == 1
    assert len(list_pool(db_session, status="offered")) == 0
