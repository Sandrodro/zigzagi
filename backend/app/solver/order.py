from app.solver.model import WordConstraint, crossings


def fill_order(constraints: list[WordConstraint]) -> list[int]:
    cx = crossings(constraints)
    remaining = set(range(len(constraints)))
    # First: the longest constraint (ties -> lower index).
    first = min(remaining, key=lambda i: (-constraints[i].length, i))
    order = [first]
    remaining.remove(first)
    chosen = {first}
    while remaining:

        def overlap(i: int) -> int:
            return len(cx[i] & chosen)

        nxt = min(
            remaining,
            key=lambda i: (-overlap(i), -constraints[i].length, i),
        )
        order.append(nxt)
        remaining.remove(nxt)
        chosen.add(nxt)
    return order


def bound_positions(
    constraints: list[WordConstraint], order: list[int]
) -> dict[int, tuple[int, ...]]:
    assigned_cells: set[tuple[int, int]] = set()
    bp: dict[int, tuple[int, ...]] = {}
    for i in order:
        con = constraints[i]
        bp[i] = tuple(p for p, cell in enumerate(con.cells) if cell in assigned_cells)
        assigned_cells.update(con.cells)
    return bp
