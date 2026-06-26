from app.solver.freeform import _finalize


def test_finalize_normalizes_and_reproduces_words():
    # "cat" across at (5,5); "car" down at (5,5). Expect 2 entries, words preserved.
    grid = {}
    for i, ch in enumerate("cat"):
        grid[(5, 5 + i)] = ch
    for i, ch in enumerate("car"):
        grid[(5 + i, 5)] = ch  # (5,5) shared 'c'
    res = _finalize(grid)
    assert res.rows == 3 and res.cols == 3          # bounding box normalized
    answers = sorted(e.answer for e in res.entries)
    assert answers == ["car", "cat"]
    assert all(e.provenance == "freeform" for e in res.entries)
    # blocks = bounding-box cells with no letter (here corners except the L-shape)
    assert (2, 2) in res.blocks
