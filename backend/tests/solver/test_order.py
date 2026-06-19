from app.solver.model import build_constraints
from app.solver.order import bound_positions, fill_order
from app.solver.templates import Template


def _grid():
    return Template(id="t", rows=5, cols=5, blocks=frozenset())


def test_order_starts_with_a_longest_constraint():
    cons = build_constraints(_grid())
    order = fill_order(cons)
    assert cons[order[0]].length == max(c.length for c in cons)
    assert len(order) == len(cons)
    assert sorted(order) == list(range(len(cons)))  # a permutation


def test_first_constraint_has_no_bound_positions():
    cons = build_constraints(_grid())
    order = fill_order(cons)
    bp = bound_positions(cons, order)
    assert bp[order[0]] == ()


def test_later_constraints_gain_bound_positions():
    cons = build_constraints(_grid())
    order = fill_order(cons)
    bp = bound_positions(cons, order)
    # Some constraint after the first must share a cell with an earlier one.
    assert any(len(bp[i]) > 0 for i in order[1:])
