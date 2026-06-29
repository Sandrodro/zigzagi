"""Derive new templates by extending short edge words OUTWARD past the boundary.

A 3-letter word whose run ends on the grid boundary in its own direction
(across word touching the left/right edge, down word touching the top/bottom
edge) is grown AWAY from that edge, outside the original grid, to TARGET_LEN
(7 = most common lemma length). The grid bounding box grows; margin cells that
aren't part of an extended word become `absent` (background, not black).

Qualifying words come in 180°-symmetric pairs that grow in opposite
directions, so symmetry is preserved automatically.

Run from backend/:  uv run python -m scripts.extend_edge_words
Writes 11x11-004/005/006.json next to their sources. Asserts the geometry is
sound, then verifies each result fills against the lemmas wordpool (report).
"""
import json
from pathlib import Path

LIB = Path(__file__).resolve().parents[1] / "app" / "solver" / "templates"
TARGET_LEN = 7
MAX_SIZE = 15  # final bounding box must not exceed MAX_SIZE x MAX_SIZE
SOURCES = {"11x11-001": "11x11-004", "11x11-002": "11x11-005", "11x11-003": "11x11-006"}


def _runs(rows, cols, blocks):
    """All maximal across+down runs of playable cells, as (direction, [cells])."""
    out = []
    for r in range(rows):
        run = []
        for c in range(cols):
            if (r, c) in blocks:
                if run: out.append(("across", run))
                run = []
            else:
                run.append((r, c))
        if run: out.append(("across", run))
    for c in range(cols):
        run = []
        for r in range(rows):
            if (r, c) in blocks:
                if run: out.append(("down", run))
                run = []
            else:
                run.append((r, c))
        if run: out.append(("down", run))
    return out


def _protrusions(rows, cols, run, direction, ext):
    """The `ext` new cells extending `run` outward past the edge it touches,
    or None if the run doesn't qualify (doesn't end on a boundary in its direction)."""
    n = ext
    (r0, c0), (r1, c1) = run[0], run[-1]
    if direction == "across":
        if c0 == 0:        # left edge -> grow left
            return [(r0, -1 - i) for i in range(n)]
        if c1 == cols - 1:  # right edge -> grow right
            return [(r0, cols + i) for i in range(n)]
    else:
        if r0 == 0:        # top edge -> grow up
            return [(-1 - i, c0) for i in range(n)]
        if r1 == rows - 1:  # bottom edge -> grow down
            return [(rows + i, c0) for i in range(n)]
    return None


def _symmetric(rows, cols, nonplayable):
    return all((rows - 1 - r, cols - 1 - c) in nonplayable for (r, c) in nonplayable)


def _connected(playable):
    if not playable:
        return False
    start = next(iter(playable))
    seen, stack = {start}, [start]
    while stack:
        r, c = stack.pop()
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if (nr, nc) in playable and (nr, nc) not in seen:
                seen.add((nr, nc)); stack.append((nr, nc))
    return seen == playable


def extend(src: dict, new_id: str) -> dict:
    rows, cols = src["rows"], src["cols"]
    blocks = {(r, c) for r, c in src["blocks"]}

    # Cap the outward extension so the symmetric growth (ext per side, both sides)
    # keeps the final bounding box within MAX_SIZE x MAX_SIZE.
    ext = min(TARGET_LEN - 3, (MAX_SIZE - rows) // 2, (MAX_SIZE - cols) // 2)
    assert ext >= 1, f"{new_id}: source {rows}x{cols} too large to extend within {MAX_SIZE}"

    protr = []  # all new playable cells (raw coords, may be negative)
    qualifying = 0
    for direction, run in _runs(rows, cols, blocks):
        if len(run) != 3:
            continue
        cells = _protrusions(rows, cols, run, direction, ext)
        if cells is not None:
            protr.extend(cells)
            qualifying += 1

    # original playable cells
    orig_play = {(r, c) for r in range(rows) for c in range(cols) if (r, c) not in blocks}
    play = orig_play | set(protr)

    # renormalize to non-negative coords
    rmin = min(r for r, _ in play)
    cmin = min(c for _, c in play)
    rmax = max(r for r, _ in play)
    cmax = max(c for _, c in play)
    dr, dc = -rmin, -cmin
    nrows, ncols = rmax - rmin + 1, cmax - cmin + 1
    sh = lambda r, c: (r + dr, c + dc)

    play_s = {sh(r, c) for r, c in play}
    block_s = {sh(r, c) for r, c in blocks}  # real black squares (shifted)
    rect = {(r, c) for r in range(nrows) for c in range(ncols)}
    absent = rect - play_s - block_s         # margin around protrusions

    # --- self-checks ---
    assert nrows <= MAX_SIZE and ncols <= MAX_SIZE, f"{new_id}: {nrows}x{ncols} exceeds {MAX_SIZE}"
    nonplay = block_s | absent
    assert _symmetric(nrows, ncols, nonplay), f"{new_id}: not 180-symmetric"
    assert _connected(play_s), f"{new_id}: playable not connected"
    for direction, run in _runs(nrows, ncols, nonplay):
        # length-1 runs are unchecked singletons (e.g. a protrusion cell's
        # cross-direction), exactly as validate_template tolerates.
        assert len(run) != 2, f"{new_id}: word run of length 2 at {run}"
        (a0, b0), (a1, b1) = run[0], run[-1]
        on_edge = (direction == "across" and (b0 == 0 or b1 == ncols - 1)) or \
                  (direction == "down" and (a0 == 0 or a1 == nrows - 1))
        assert not (len(run) == 3 and on_edge), f"{new_id}: 3-letter edge word survived at {run}"

    print(f"{new_id}: extended {qualifying} edge words, {rows}x{cols} -> {nrows}x{ncols}, "
          f"{len(absent)} absent cells")
    return {
        "id": new_id,
        "rows": nrows,
        "cols": ncols,
        "blocks": sorted([r, c] for (r, c) in block_s),
        "absent": sorted([r, c] for (r, c) in absent),
    }


def _verify_fill(new_id: str):
    """Real fill against the lemmas wordpool — report only, not a gate."""
    try:
        from app.db import SessionLocal
        from app.models import WordpoolLemma
        from app.solver.index import Wordlist
        from app.solver.run import FillResult, fill
        from app.solver.templates import load_library
    except Exception as e:  # pragma: no cover - env without DB deps
        print(f"  fill check skipped ({e})")
        return
    db = SessionLocal()
    words = [w for (w,) in db.query(WordpoolLemma.word).filter(WordpoolLemma.status == "active")]
    if not words:
        print("  fill check skipped (lemmas wordpool empty)")
        return
    t = next(x for x in load_library(LIB) if x.id == new_id)
    result = fill(t, words, Wordlist(words), seed_value=7, min_seeds=0, deadline_s=15.0)
    ok = isinstance(result, FillResult)
    print(f"  fill on lemmas: {'OK' if ok else 'FAILED — ' + getattr(result, 'reason', '?')}")


def main():
    for src_id, new_id in SOURCES.items():
        src = json.loads((LIB / f"{src_id}.json").read_text(encoding="utf-8"))
        out = extend(src, new_id)
        (LIB / f"{new_id}.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        _verify_fill(new_id)


if __name__ == "__main__":
    main()
