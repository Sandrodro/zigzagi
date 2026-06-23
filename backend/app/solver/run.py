from dataclasses import dataclass

from app.solver.fill import FillTimeout, backtrack_fill
from app.solver.index import Wordlist
from app.solver.model import build_constraints
from app.solver.order import bound_positions, fill_order
from app.solver.seeds import choose_seed_slots
from app.solver.templates import Template


@dataclass
class FilledEntry:
    number: int
    direction: str
    row: int
    col: int
    answer: str
    provenance: str


@dataclass
class FillResult:
    template_id: str
    grid: dict[tuple[int, int], str]
    entries: list[FilledEntry]


@dataclass
class FillFailure:
    reason: str


def fill(
    template: Template,
    seeds: list[str],
    wordlist: Wordlist,
    seed_value: int,
    min_seeds: int = 10,
    deadline_s: float = 10.0,
) -> FillResult | FillFailure:
    constraints = build_constraints(template)
    order = fill_order(constraints)
    bp = bound_positions(constraints, order)

    seed_set = set(seeds)
    seed_slots = set(choose_seed_slots(constraints, template.rows, template.cols, min_seeds))

    # Per-constraint candidate pools: seed slots draw from seeds (matched by length),
    # everything else from the general wordlist.
    seeds_by_len: dict[int, list[str]] = {}
    for w in sorted(seed_set):
        seeds_by_len.setdefault(len(w), []).append(w)

    pools: dict[int, list[str]] = {}
    for i, con in enumerate(constraints):
        if i in seed_slots:
            pool = seeds_by_len.get(con.length, [])
            if not pool:  # not enough seeds of this length to honor the reservation
                return FillFailure(reason=f"no seed word of length {con.length} for slot {con.number}")
            pools[i] = pool
        else:
            pools[i] = wordlist.by_length(con.length)

    if len(seed_slots) < min_seeds:
        return FillFailure(reason=f"only {len(seed_slots)} seed slots available, need {min_seeds}")

    try:
        assignment = backtrack_fill(constraints, order, bp, pools, deadline_s, seed_value)
    except FillTimeout:
        return FillFailure(reason=f"fill exceeded {deadline_s:.0f}s deadline")
    if assignment is None:
        return FillFailure(reason="no satisfying fill for this template + wordlist")

    entries = []
    for con in constraints:
        answer = "".join(assignment[cell] for cell in con.cells)
        entries.append(
            FilledEntry(
                number=con.number,
                direction=con.direction,
                row=con.cells[0][0],
                col=con.cells[0][1],
                answer=answer,
                provenance="sourced" if answer in seed_set else "general-fill",
            )
        )
    return FillResult(template_id=template.id, grid=assignment, entries=entries)
