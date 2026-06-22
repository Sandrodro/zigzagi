import time
from collections import defaultdict

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
    # Forward-checking CSP with dynamic MRV ordering. (order/bp are kept for
    # signature compatibility but superseded: MRV picks the variable and forward
    # checking prunes future domains, which scales to large wordlists where the
    # old static-order backward-only search did not.)
    n = len(constraints)

    # cell -> [(slot, position-within-slot)], so an assignment can find crossings.
    cell_slots: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    for i, con in enumerate(constraints):
        for p, cell in enumerate(con.cells):
            cell_slots[cell].append((i, p))

    # posmap[i][p][ch] = words in slot i's pool with letter ch at position p.
    posmap: dict[int, list[dict[str, frozenset[str]]]] = {}
    for i, con in enumerate(constraints):
        cols: list[dict[str, set[str]]] = [defaultdict(set) for _ in range(con.length)]
        for w in candidate_pools[i]:
            for p, ch in enumerate(w):
                cols[p][ch].add(w)
        posmap[i] = [{ch: frozenset(ws) for ch, ws in col.items()} for col in cols]

    domains: dict[int, set[str]] = {i: set(candidate_pools[i]) for i in range(n)}
    if any(not d for d in domains.values()):
        return None

    assigned: dict[int, str] = {}
    deadline = time.monotonic() + deadline_s
    EMPTY: frozenset[str] = frozenset()

    def recurse() -> bool:
        if time.monotonic() > deadline:
            raise FillTimeout()
        if len(assigned) == n:
            return True
        # MRV: smallest remaining domain, ties broken by slot index (deterministic).
        i = min(
            (j for j in range(n) if j not in assigned),
            key=lambda j: (len(domains[j]), j),
        )
        for w in sorted(domains[i]):  # sorted => deterministic value order
            assigned[i] = w
            removed: dict[int, set[str]] = {}
            ok = True
            # Forward-check every unassigned slot crossing slot i.
            for p, cell in enumerate(constraints[i].cells):
                ch = w[p]
                for j, pj in cell_slots[cell]:
                    if j == i or j in assigned:
                        continue
                    keep = domains[j] & posmap[j][pj].get(ch, EMPTY)
                    if len(keep) != len(domains[j]):
                        removed.setdefault(j, set()).update(domains[j] - keep)
                        domains[j] = keep
                    if not keep:
                        ok = False
                        break
                if not ok:
                    break
            # No duplicate words across slots: drop w from every other live domain.
            if ok:
                for j in range(n):
                    if j != i and j not in assigned and w in domains[j]:
                        removed.setdefault(j, set()).add(w)
                        domains[j].discard(w)
                        if not domains[j]:
                            ok = False
                            break
            if ok and recurse():
                return True
            for j, ws in removed.items():  # restore on backtrack
                domains[j] |= ws
            del assigned[i]
        return False

    if not recurse():
        return None

    grid: dict[tuple[int, int], str] = {}
    for i, w in assigned.items():
        for p, cell in enumerate(constraints[i].cells):
            grid[cell] = w[p]
    return grid
