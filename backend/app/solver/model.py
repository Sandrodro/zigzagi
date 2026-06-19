from collections import defaultdict
from dataclasses import dataclass

from app.solver.numbering import number_cells
from app.solver.templates import Template


@dataclass(frozen=True)
class WordConstraint:
    number: int
    direction: str  # "across" | "down"
    cells: tuple[tuple[int, int], ...]

    @property
    def length(self) -> int:
        return len(self.cells)


def _runs(t: Template, direction: str) -> list[list[tuple[int, int]]]:
    runs = []
    outer, inner = (t.rows, t.cols) if direction == "across" else (t.cols, t.rows)
    for a in range(outer):
        run = []
        for b in range(inner):
            r, c = (a, b) if direction == "across" else (b, a)
            if (r, c) in t.blocks:
                if len(run) >= 3:
                    runs.append(run)
                run = []
            else:
                run.append((r, c))
        if len(run) >= 3:
            runs.append(run)
    return runs


def build_constraints(t: Template) -> list[WordConstraint]:
    nums = number_cells(t)
    cons = []
    for direction in ("across", "down"):
        for run in _runs(t, direction):
            cons.append(
                WordConstraint(number=nums[run[0]], direction=direction, cells=tuple(run))
            )
    return cons


def crossings(constraints: list[WordConstraint]) -> dict[int, set[int]]:
    cell_to_cons: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, con in enumerate(constraints):
        for cell in con.cells:
            cell_to_cons[cell].append(i)
    cx: dict[int, set[int]] = {i: set() for i in range(len(constraints))}
    for indices in cell_to_cons.values():
        for i in indices:
            for j in indices:
                if i != j:
                    cx[i].add(j)
    return cx
