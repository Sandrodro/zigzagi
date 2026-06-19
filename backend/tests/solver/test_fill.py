import pytest

from app.solver.fill import FillTimeout, backtrack_fill, constraint_index
from app.solver.model import build_constraints
from app.solver.order import bound_positions, fill_order
from app.solver.templates import Template


def test_constraint_index_keys_on_bound_letters():
    idx = constraint_index(["აბგ", "აბდ", "ვზთ"], positions=(0,))
    assert set(idx[("ა",)]) == {"აბგ", "აბდ"}
    assert idx[("ვ",)] == ["ვზთ"]


def _tiny():
    # 3x3 open grid: 3 across + 3 down, all length 3.
    return Template(id="t", rows=3, cols=3, blocks=frozenset())


def test_fill_solves_a_consistent_3x3():
    cons = build_constraints(_tiny())
    order = fill_order(cons)
    bp = bound_positions(cons, order)
    # 6 distinct words forming a consistent 3x3 square (rows + columns).
    #   შცგ          š c g
    #   რჰჯ    -->   r h j   columns: შრჩ, ცჰუ, გჯხ
    #   ჩუხ          č u x
    words = ["შცგ", "რჰჯ", "ჩუხ", "შრჩ", "ცჰუ", "გჯხ"]
    pools = {i: words for i in range(len(cons))}
    grid = backtrack_fill(cons, order, bp, pools, deadline_s=2.0)
    assert grid is not None
    assert len(grid) == 9


def test_fill_returns_none_when_unsatisfiable():
    cons = build_constraints(_tiny())
    order = fill_order(cons)
    bp = bound_positions(cons, order)
    pools = {i: ["აბგ"] for i in range(len(cons))}  # only one word, can't fill 6 slots w/o dupes
    assert backtrack_fill(cons, order, bp, pools, deadline_s=2.0) is None


def test_fill_raises_on_deadline():
    cons = build_constraints(_tiny())
    order = fill_order(cons)
    bp = bound_positions(cons, order)
    pools = {i: ["აბგ", "ბეზ", "გზთ"] for i in range(len(cons))}
    with pytest.raises(FillTimeout):
        backtrack_fill(cons, order, bp, pools, deadline_s=0.0)
