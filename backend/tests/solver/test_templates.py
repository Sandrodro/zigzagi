from pathlib import Path

from app.solver.templates import load_library, pick_template, validate_template

LIB_DIR = Path(__file__).resolve().parents[2] / "app" / "solver" / "templates"


def test_every_shipped_template_is_valid():
    for t in load_library(LIB_DIR):
        assert validate_template(t) == [], f"{t.id} invalid: {validate_template(t)}"


def test_validate_flags_asymmetric():
    from app.solver.templates import Template
    bad = Template(id="bad", rows=13, cols=13, blocks=frozenset({(0, 3)}))  # no mirror
    assert any("symmet" in p.lower() for p in validate_template(bad))


def test_pick_is_deterministic():
    lib = load_library(LIB_DIR)
    assert pick_template(lib, 42).id == pick_template(lib, 42).id
    # Different seeds may pick different templates across the library.
