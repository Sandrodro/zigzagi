from app.solver.freeform import _run_through, _placement_valid


def _grid(words_across):
    # words_across: list of (word, r, c) placed across; returns grid dict
    g = {}
    for w, r, c in words_across:
        for i, ch in enumerate(w):
            g[(r, c + i)] = ch
    return g


def test_run_through_returns_maximal_run():
    g = _grid([("cat", 0, 0)])
    assert _run_through(g, 0, 1, 0, 1) == "cat"   # across run
    assert _run_through(g, 0, 1, 1, 0) == "a"     # down run is single cell


def test_valid_crossing_accepted():
    # "cat" across at (0,0); place "car" down crossing the 'c' at (0,0)
    g = _grid([("cat", 0, 0)])
    assert _placement_valid(g, "car", 0, 0, "down", {"cat", "car"}) is True


def test_overlap_mismatch_rejected():
    g = _grid([("cat", 0, 0)])
    # place "dog" down at (0,0): 'd' != existing 'c'
    assert _placement_valid(g, "dog", 0, 0, "down", {"cat", "dog"}) is False


def test_collinear_merge_rejected():
    # "cat" across at (0,0); placing "dog" across at (0,3) abuts -> merges into "catdog"
    g = _grid([("cat", 0, 0)])
    assert _placement_valid(g, "dog", 0, 3, "across", {"cat", "dog"}) is False


def test_invalid_incidental_run_rejected():
    # A length-2 down stub at column 1: (0,1)="a",(1,1)="b" (tolerated, len 2).
    # Placing across word "qxr" at (2,0) puts a NEW cell "x" at (2,1), extending the
    # column-1 run to "abx" (len 3). "abx" is not in the wordset -> reject.
    g = {(0, 1): "a", (1, 1): "b"}
    assert _placement_valid(g, "qxr", 2, 0, "across", {"qxr"}) is False
