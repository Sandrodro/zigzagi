import random
import time
from dataclasses import dataclass

from app.solver.index import Wordlist
from app.solver.model import build_constraints
from app.solver.run import FilledEntry, FillFailure
from app.solver.templates import Template

_DELTA = {"across": (0, 1), "down": (1, 0)}


def cross_ratio(t: Template) -> float:
    """Fraction of white cells crossed by BOTH an across and a down word."""
    blocks = t.blocks

    def in_word(r, c, dr, dc):
        prev = 0 <= r - dr < t.rows and 0 <= c - dc < t.cols and (r - dr, c - dc) not in blocks
        nxt = 0 <= r + dr < t.rows and 0 <= c + dc < t.cols and (r + dr, c + dc) not in blocks
        return prev or nxt

    play = [(r, c) for r in range(t.rows) for c in range(t.cols) if (r, c) not in blocks]
    crossed = sum(1 for (r, c) in play if in_word(r, c, 0, 1) and in_word(r, c, 1, 0))
    return crossed / len(play) if play else 0.0


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


@dataclass
class FreeformResult:
    rows: int
    cols: int
    blocks: list[tuple[int, int]]
    grid: dict[tuple[int, int], str]
    entries: list[FilledEntry]
    density: float


def _finalize(placed_grid: dict[tuple[int, int], str]) -> FreeformResult:
    min_r = min(r for r, _ in placed_grid)
    min_c = min(c for _, c in placed_grid)
    grid = {(r - min_r, c - min_c): ch for (r, c), ch in placed_grid.items()}
    rows = max(r for r, _ in grid) + 1
    cols = max(c for _, c in grid) + 1
    blocks = frozenset(
        (r, c) for r in range(rows) for c in range(cols) if (r, c) not in grid
    )
    template = Template(id="freeform", rows=rows, cols=cols, blocks=blocks)
    entries = []
    for con in build_constraints(template):
        answer = "".join(grid[cell] for cell in con.cells)
        entries.append(
            FilledEntry(
                number=con.number,
                direction=con.direction,
                row=con.cells[0][0],
                col=con.cells[0][1],
                answer=answer,
                provenance="freeform",
            )
        )
    return FreeformResult(
        rows=rows, cols=cols, blocks=sorted(blocks), grid=grid,
        entries=entries, density=cross_ratio(template),
    )


def _apply(grid, word, r0, c0, direction):
    dr, dc = _DELTA[direction]
    added = []
    for i, ch in enumerate(word):
        cell = (r0 + dr * i, c0 + dc * i)
        if cell not in grid:
            added.append(cell)
        grid[cell] = ch
    return added  # cells this placement newly occupied (for undo)


def _new_crossings(grid, word, r0, c0, direction) -> int:
    dr, dc = _DELTA[direction]
    pdr, pdc = (dc, dr)
    score = 0
    for i in range(len(word)):
        cell = (r0 + dr * i, c0 + dc * i)
        if cell in grid:
            continue  # crossing an existing word: already counted by that word
        r, c = cell
        if (r + pdr, c + pdc) in grid or (r - pdr, c - pdc) in grid:
            score += 1
    return score


def _candidate_placements(grid, placed, letter_idx, wordset):
    """Yield (word, r0, c0, direction) valid placements crossing existing cells."""
    for word, pr, pc, pdir in placed:
        pdr, pdc = _DELTA[pdir]
        cross_dir = "down" if pdir == "across" else "across"
        dr, dc = _DELTA[cross_dir]
        for i in range(len(word)):
            cell = (pr + pdr * i, pc + pdc * i)
            L = grid[cell]
            for cand, offset in letter_idx.get(L, ()):
                r0, c0 = cell[0] - dr * offset, cell[1] - dc * offset
                if _placement_valid(grid, cand, r0, c0, cross_dir, wordset):
                    yield (cand, r0, c0, cross_dir)


def construct(wordlist, seed_value, *, target_words=28, target_density=0.6,
              min_len=3, seed_min_len=10, min_words=20, backtrack_budget=2000,
              max_iters=200000, deadline_s=20.0):
    rng = random.Random(seed_value)
    words = wordlist.all()
    if not words:
        return FillFailure(reason="freeform: empty wordlist")
    wordset = set(words)
    letter_idx = _letter_index(wordlist, min_len)

    seed_pool = [w for w in words if len(w) >= seed_min_len] or \
        sorted(words, key=len, reverse=True)[: max(1, len(words) // 10)]
    seed_word = rng.choice(sorted(seed_pool))

    grid: dict[tuple[int, int], str] = {}
    _apply(grid, seed_word, 0, 0, "across")
    placed = [(seed_word, 0, 0, "across")]
    best = list(placed)
    best_grid = dict(grid)

    blacklist: set = set()
    undos = 0
    deadline = time.monotonic() + deadline_s

    for _ in range(max_iters):
        if len(placed) >= target_words or time.monotonic() > deadline:
            break
        # gather + score candidates (skip blacklisted at this depth)
        depth = len(placed)
        cands = []
        for cand in _candidate_placements(grid, placed, letter_idx, wordset):
            if (depth, cand) in blacklist:
                continue
            cands.append(cand)
        if cands:
            # prefer most new crossings (density), then mid-length (5-9), then seeded shuffle
            rng.shuffle(cands)
            cands.sort(key=lambda c: (
                -_new_crossings(grid, c[0], c[1], c[2], c[3]),
                abs(len(c[0]) - 7),
            ))
            chosen = cands[0]
            _apply(grid, *chosen)
            placed.append(chosen)
            if len(placed) > len(best):
                best, best_grid = list(placed), dict(grid)
        else:
            # dead-end: backtrack
            if len(placed) <= 1 or undos >= backtrack_budget:
                break
            last = placed.pop()
            blacklist.add((len(placed), last))
            # rebuild grid from scratch (simple + correct for an experiment)
            grid = {}
            for w, r, c, d in placed:
                _apply(grid, w, r, c, d)
            undos += 1

    final_placed, final_grid = (best, best_grid) if len(best) >= len(placed) else (placed, grid)
    if len(final_placed) < min_words:
        return FillFailure(reason=f"freeform: only {len(final_placed)} words (need {min_words})")
    return _finalize(final_grid)
