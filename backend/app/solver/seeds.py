from app.solver.model import WordConstraint


def _centrality(con: WordConstraint, rows: int, cols: int) -> float:
    mid_r, mid_c = (rows - 1) / 2, (cols - 1) / 2
    r0, c0 = con.cells[0]
    return -((r0 - mid_r) ** 2 + (c0 - mid_c) ** 2)  # higher = more central


def choose_seed_slots(
    constraints: list[WordConstraint], rows: int, cols: int, min_seeds: int
) -> list[int]:
    ranked = sorted(
        range(len(constraints)),
        key=lambda i: (-constraints[i].length, -_centrality(constraints[i], rows, cols), i),
    )
    return ranked[:min_seeds]
