import time

from app.solver.model import WordConstraint


class FillTimeout(Exception):
    pass


def constraint_index(
    words: list[str], positions: tuple[int, ...]
) -> dict[tuple[str, ...], list[str]]:
    idx: dict[tuple[str, ...], list[str]] = {}
    for w in words:
        key = tuple(w[p] for p in positions)
        idx.setdefault(key, []).append(w)
    return idx


def backtrack_fill(
    constraints: list[WordConstraint],
    order: list[int],
    bp: dict[int, tuple[int, ...]],
    candidate_pools: dict[int, list[str]],
    deadline_s: float,
) -> dict[tuple[int, int], str] | None:
    # Pre-build a bound-position index per constraint (the permuted dictionary).
    indexes = {
        i: constraint_index(candidate_pools[i], bp[i]) for i in order
    }
    assignment: dict[tuple[int, int], str] = {}
    used: set[str] = set()
    deadline = time.monotonic() + deadline_s

    def recurse(pos: int) -> bool:
        if time.monotonic() > deadline:
            raise FillTimeout()
        if pos == len(order):
            return True
        i = order[pos]
        con = constraints[i]
        key = tuple(assignment[con.cells[p]] for p in bp[i])
        for word in indexes[i].get(key, ()):
            if word in used:
                continue
            # Free cells (not bound) must be writable without clobbering a conflict.
            writes = [
                (con.cells[j], ch)
                for j, ch in enumerate(word)
                if j not in bp[i]
            ]
            if any(assignment.get(cell, ch) != ch for cell, ch in writes):
                continue
            for cell, ch in writes:
                assignment[cell] = ch
            used.add(word)
            if recurse(pos + 1):
                return True
            used.discard(word)
            for cell, _ in writes:
                del assignment[cell]
        return False

    return assignment if recurse(0) else None
