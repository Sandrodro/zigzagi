from app.solver.model import build_constraints, crossings
from app.solver.numbering import number_cells
from app.solver.templates import Template


def _open_grid(n=5):  # no blocks: rows + cols are the runs
    return Template(id="t", rows=n, cols=n, blocks=frozenset())


def test_numbering_top_left_is_one():
    nums = number_cells(_open_grid())
    assert nums[(0, 0)] == 1
    assert nums[(0, 1)] == 2  # starts a down run


def test_constraints_cover_rows_and_cols():
    cons = build_constraints(_open_grid())
    across = [c for c in cons if c.direction == "across"]
    down = [c for c in cons if c.direction == "down"]
    assert len(across) == 5 and len(down) == 5
    assert across[0].cells[0] == (0, 0) and across[0].length == 5


def test_crossings_link_across_and_down():
    cons = build_constraints(_open_grid())
    cx = crossings(cons)
    # The first across constraint crosses every down constraint (full grid).
    assert len(cx[0]) >= 1
