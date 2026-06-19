import datetime as dt

from app.seed import seed_demo_puzzle


def test_seed_creates_one_published_puzzle(db_session):
    p = seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 18))
    db_session.flush()
    assert p.status == "published"
    assert p.grid_template["rows"] == 5
    assert p.grid_template["cols"] == 5
    # 5 across + 5 down entries
    assert len(p.entries) == 10
    assert sum(1 for e in p.entries if e.direction == "across") == 5
    assert sum(1 for e in p.entries if e.direction == "down") == 5


def test_seed_entries_are_consistent_at_intersections(db_session):
    p = seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 18))
    # Build a cell->letter map from every entry; conflicting writes would mean
    # an inconsistent fixture.
    cell = {}
    for e in p.entries:
        r, c = e.row, e.col
        for ch in e.answer:
            if (r, c) in cell:
                assert cell[(r, c)] == ch, f"conflict at {(r, c)}"
            cell[(r, c)] = ch
            if e.direction == "across":
                c += 1
            else:
                r += 1
    assert len(cell) == 25  # full 5×5 grid covered
