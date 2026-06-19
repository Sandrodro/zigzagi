from app.solver.templates import Template


def _playable(t: Template, r: int, c: int) -> bool:
    return 0 <= r < t.rows and 0 <= c < t.cols and (r, c) not in t.blocks


def number_cells(t: Template) -> dict[tuple[int, int], int]:
    nums: dict[tuple[int, int], int] = {}
    n = 0
    for r in range(t.rows):
        for c in range(t.cols):
            if not _playable(t, r, c):
                continue
            starts_across = not _playable(t, r, c - 1) and _playable(t, r, c + 1)
            starts_down = not _playable(t, r - 1, c) and _playable(t, r + 1, c)
            if starts_across or starts_down:
                n += 1
                nums[(r, c)] = n
    return nums
