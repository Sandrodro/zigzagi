from app.solver.freeform import construct, _DELTA, _run_through, FreeformResult
from app.solver.index import Wordlist

# A small interlocking word set (ASCII; engine is char-agnostic).
WORDS = [
    "cart", "care", "cane", "core", "cope", "rope", "ripe", "rice",
    "race", "rate", "tare", "tine", "vine", "pane", "pine", "code",
    "node", "mode", "made", "mare", "acre", "earn", "near", "neat",
    "tend", "rend", "send", "sane", "lane", "land",
]


def _all_runs_valid(res: FreeformResult, wordset):
    # every >=3 run (across+down) in the normalized grid must be a dataset word
    for direction, (dr, dc) in _DELTA.items():
        for (r, c) in res.grid:
            if (r - dr, c - dc) in res.grid:
                continue  # not a run start
            run = _run_through(res.grid, r, c, dr, dc)
            if len(run) >= 3:
                assert run in wordset, f"invalid run {run!r}"


def test_construct_produces_valid_connected_puzzle():
    wl = Wordlist(WORDS)
    res = construct(wl, seed_value=1, target_words=10, seed_min_len=4,
                    min_words=3, deadline_s=10.0)
    assert isinstance(res, FreeformResult)
    assert len(res.entries) >= 3
    _all_runs_valid(res, set(WORDS))


def test_construct_is_deterministic():
    wl = Wordlist(WORDS)
    a = construct(wl, seed_value=7, target_words=10, seed_min_len=4, min_words=3, deadline_s=10.0)
    b = construct(wl, seed_value=7, target_words=10, seed_min_len=4, min_words=3, deadline_s=10.0)
    assert isinstance(a, FreeformResult) and isinstance(b, FreeformResult)
    assert [e.answer for e in a.entries] == [e.answer for e in b.entries]
    assert a.grid == b.grid
