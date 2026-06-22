import json
from dataclasses import dataclass
from pathlib import Path

# Slot-count density band, as a fraction of grid area (lo, hi). Lower = sparser
# grids (fewer/shorter entries, easier to fill). 10x10 → 16–28 slots.
SLOT_DENSITY_MIN = 0.16
SLOT_DENSITY_MAX = 0.28


@dataclass(frozen=True)
class Template:
    id: str
    rows: int
    cols: int
    blocks: frozenset[tuple[int, int]]


def load_library(directory: Path) -> list[Template]:
    templates = []
    for path in sorted(directory.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        templates.append(
            Template(
                id=data["id"], rows=data["rows"], cols=data["cols"],
                blocks=frozenset((r, c) for r, c in data["blocks"]),
            )
        )
    return templates


def _runs(t: Template) -> list[list[tuple[int, int]]]:
    """All maximal across+down runs of playable cells."""
    runs = []
    for r in range(t.rows):  # across
        run = []
        for c in range(t.cols):
            if (r, c) in t.blocks:
                if run:
                    runs.append(run)
                run = []
            else:
                run.append((r, c))
        if run:
            runs.append(run)
    for c in range(t.cols):  # down
        run = []
        for r in range(t.rows):
            if (r, c) in t.blocks:
                if run:
                    runs.append(run)
                run = []
            else:
                run.append((r, c))
        if run:
            runs.append(run)
    return runs


def _connected(t: Template) -> bool:
    playable = {(r, c) for r in range(t.rows) for c in range(t.cols) if (r, c) not in t.blocks}
    if not playable:
        return False
    start = next(iter(playable))
    seen, stack = {start}, [start]
    while stack:
        r, c = stack.pop()
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if (nr, nc) in playable and (nr, nc) not in seen:
                seen.add((nr, nc))
                stack.append((nr, nc))
    return seen == playable


def validate_template(t: Template) -> list[str]:
    problems = []
    for (r, c) in t.blocks:
        if (t.rows - 1 - r, t.cols - 1 - c) not in t.blocks:
            problems.append(f"not symmetric at ({r},{c})")
            break
    word_runs = [run for run in _runs(t) if len(run) >= 2]  # length-1 runs are unchecked singletons
    if any(len(run) < 3 for run in word_runs):
        problems.append("word run shorter than 3")
    slots = [run for run in _runs(t) if len(run) >= 3]
    # Slot count scales with grid area (see SLOT_DENSITY_MIN/MAX); 10x10 → 16-28.
    area = t.rows * t.cols
    lo, hi = round(area * SLOT_DENSITY_MIN), round(area * SLOT_DENSITY_MAX)
    if not (lo <= len(slots) <= hi):
        problems.append(f"slot count {len(slots)} outside {lo}-{hi}")
    if not _connected(t):
        problems.append("grid not connected")
    return problems


def pick_template(library: list[Template], seed_value: int) -> Template:
    ordered = sorted(library, key=lambda t: t.id)
    return ordered[seed_value % len(ordered)]
