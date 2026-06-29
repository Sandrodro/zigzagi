from pathlib import Path

from app.solver.model import build_constraints
from app.solver.templates import load_library, pick_template, validate_template

LIB_DIR = Path(__file__).resolve().parents[2] / "app" / "solver" / "templates"


def test_every_shipped_template_is_valid():
    for t in load_library(LIB_DIR):
        assert validate_template(t) == [], f"{t.id} invalid: {validate_template(t)}"


def test_extended_templates_have_no_3letter_edge_word():
    # 004/005/006 grow every short edge word OUTWARD to length 7, marking the
    # margin around the protrusions as absent. No 3-letter word may still end
    # on the boundary in its own direction.
    extended = [t for t in load_library(LIB_DIR) if t.id in {"11x11-004", "11x11-005", "11x11-006"}]
    assert len(extended) == 3
    for t in extended:
        assert t.absent, f"{t.id} should have absent cells"
        for con in build_constraints(t):
            if con.length != 3:
                continue
            (r0, c0), (r1, c1) = con.cells[0], con.cells[-1]
            on_edge = (con.direction == "across" and (c0 == 0 or c1 == t.cols - 1)) or (
                con.direction == "down" and (r0 == 0 or r1 == t.rows - 1)
            )
            assert not on_edge, f"{t.id}: 3-letter edge word survived at {con.cells}"


def test_validate_flags_asymmetric():
    from app.solver.templates import Template
    bad = Template(id="bad", rows=13, cols=13, blocks=frozenset({(0, 3)}))  # no mirror
    assert any("symmet" in p.lower() for p in validate_template(bad))


def test_pick_is_deterministic():
    lib = load_library(LIB_DIR)
    assert pick_template(lib, 42).id == pick_template(lib, 42).id
    # Different seeds may pick different templates across the library.
