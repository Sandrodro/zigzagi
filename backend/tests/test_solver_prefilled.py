from app.solver.index import Wordlist
from app.solver.model import build_constraints
from app.solver.run import FillFailure, FillResult, fill
from app.solver.templates import Template


def _open_5x5() -> Template:
    # A 5x5 with one centre block pair: rows of 5 -> across slots length 5 & 2 etc.
    # Keep it fully open (no blocks) so every row/col is a length-5 slot.
    return Template(id="t5", rows=5, cols=5, blocks=frozenset())


def _slot_key(con) -> str:
    return f"{con.number}{'A' if con.direction == 'across' else 'D'}"


def test_prefilled_slot_is_honored():
    t = _open_5x5()
    cons = build_constraints(t)
    # Build a guaranteed-solvable 5x5 over 25 distinct Georgian letters so every row
    # and column is a distinct word (the solver forbids duplicate words across slots,
    # so a latin square — whose rows == cols — has no duplicate-free fill).
    geo = [chr(0x10D0 + k) for k in range(25)]
    grid = [[geo[i * 5 + j] for j in range(5)] for i in range(5)]
    rows = ["".join(grid[i]) for i in range(5)]
    cols = ["".join(grid[i][j] for i in range(5)) for j in range(5)]
    wl = Wordlist(rows + cols)
    # Pick the across slot at the top row (number for (0,0) across) and pin it.
    top = next(c for c in cons if c.direction == "across" and c.cells[0] == (0, 0))
    res = fill(t, [], wl, seed_value=0, min_seeds=0, prefilled={_slot_key(top): rows[0]})
    assert isinstance(res, FillResult)
    pinned = next(e for e in res.entries if e.row == 0 and e.col == 0 and e.direction == "across")
    assert pinned.answer == rows[0]
    assert pinned.provenance == "manual"


def test_prefilled_wrong_length_fails():
    t = _open_5x5()
    cons = build_constraints(t)
    top = next(c for c in cons if c.direction == "across" and c.cells[0] == (0, 0))
    res = fill(t, [], Wordlist(["აბგდე"]), seed_value=0, min_seeds=0,
               prefilled={f"{top.number}A": "აბ"})
    assert isinstance(res, FillFailure)
    assert "length" in res.reason


def test_unknown_slot_key_fails():
    t = _open_5x5()
    res = fill(t, [], Wordlist(["აბგდე"]), seed_value=0, min_seeds=0, prefilled={"999A": "აბგდე"})
    assert isinstance(res, FillFailure)
    assert "unknown slot" in res.reason
