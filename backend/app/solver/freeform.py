from app.solver.index import Wordlist

_DELTA = {"across": (0, 1), "down": (1, 0)}


def _run_through(grid: dict[tuple[int, int], str], r: int, c: int, dr: int, dc: int) -> str:
    """Maximal contiguous occupied run through (r,c) along (dr,dc), in order."""
    # walk back to the start of the run
    sr, sc = r, c
    while (sr - dr, sc - dc) in grid:
        sr, sc = sr - dr, sc - dc
    out = []
    cr, cc = sr, sc
    while (cr, cc) in grid:
        out.append(grid[(cr, cc)])
        cr, cc = cr + dr, cc + dc
    return "".join(out)


def _placement_valid(grid, word, r0, c0, direction, wordset) -> bool:
    dr, dc = _DELTA[direction]
    pdr, pdc = (dc, dr)  # perpendicular delta
    cells = [(r0 + dr * i, c0 + dc * i) for i in range(len(word))]

    # a. overlap consistency + collect NEW cells
    new_cells = []
    for i, cell in enumerate(cells):
        existing = grid.get(cell)
        if existing is None:
            new_cells.append((cell, word[i]))
        elif existing != word[i]:
            return False

    if not new_cells:
        return False  # the word is already fully present; not a real new placement

    # b. end-cap: no collinear merge at either end
    before = (r0 - dr, c0 - dc)
    after = (r0 + dr * len(word), c0 + dc * len(word))
    if before in grid or after in grid:
        return False

    # c. incidental runs: simulate, then check every NEW cell's perpendicular run
    temp = dict(grid)
    for cell, ch in new_cells:
        temp[cell] = ch
    for (r, c), _ in new_cells:
        run = _run_through(temp, r, c, pdr, pdc)
        if len(run) >= 3 and run not in wordset:
            return False
    return True


def _letter_index(wordlist: Wordlist, min_len: int) -> dict[str, list[tuple[str, int]]]:
    """letter -> [(word, offset), ...] for every position of every word >= min_len."""
    idx: dict[str, list[tuple[str, int]]] = {}
    for w in wordlist.all():
        if len(w) < min_len:
            continue
        for o, ch in enumerate(w):
            idx.setdefault(ch, []).append((w, o))
    return idx
