"""Search for valid, fillable crossword templates and write them to the library.

Templates are a curated library (see CLAUDE.md): each candidate must pass
`validate_template` (symmetry, connectivity, slot-density band) AND actually fill
against the live DB wordlist before it's written. Random search, so most density
levers are about steering toward grids the solver can fill fast.

Density levers:
  --max-len     reject any entry longer than this. THE dominant lever — capping
                length kills full-row/col entries that make grids dense and time
                out the solver. Lower = sparser, easier. (default 8)
  --blocks      "MIN MAX" black-square count (placed in 180°-symmetric pairs).
                More blocks = more breaks = shorter entries. (default 10 18)
  slot band     fraction-of-area slot count, set by SLOT_DENSITY_MIN/MAX in
                app/solver/templates.py (also gates shipped templates, so it
                lives there, not here). Lower band = sparser.

Usage:
  uv run python -m scripts.gen_templates                 # 5 fresh 10x10s
  uv run python -m scripts.gen_templates --max-len 7 --blocks 12 20 --count 3
"""
import argparse
import json
import random
from pathlib import Path

from app.db import SessionLocal
from app.models import WordlistEntry
from app.solver.index import Wordlist
from app.solver.model import build_constraints
from app.solver.run import FillResult, fill
from app.solver.templates import Template, validate_template

LIB = Path(__file__).resolve().parents[1] / "app" / "solver" / "templates"


def symmetric_blocks(rng, rows, cols, k):
    blocks = set()
    while len(blocks) < k:
        r, c = rng.randrange(rows), rng.randrange(cols)
        blocks.add((r, c))
        blocks.add((rows - 1 - r, cols - 1 - c))  # 180° rotational symmetry
    return frozenset(blocks)


def main():
    ap = argparse.ArgumentParser(description="Generate fillable crossword templates.")
    ap.add_argument("--rows", type=int, default=10)
    ap.add_argument("--cols", type=int, default=10)
    ap.add_argument("--count", type=int, default=5, help="how many templates to write")
    ap.add_argument("--max-len", type=int, default=8, help="reject entries longer than this")
    ap.add_argument("--blocks", type=int, nargs=2, metavar=("MIN", "MAX"), default=[10, 18])
    ap.add_argument("--min-seeds", type=int, default=10, help="fill verification min_seeds")
    ap.add_argument("--deadline", type=float, default=10.0, help="fill deadline seconds")
    ap.add_argument("--rng-seed", type=int, default=42, help="RNG seed (reproducible search)")
    ap.add_argument("--max-iters", type=int, default=500_000)
    args = ap.parse_args()

    db = SessionLocal()
    allwords = [w for (w,) in db.query(WordlistEntry.word).filter(WordlistEntry.status == "active")]
    if not allwords:
        raise SystemExit("wordlist_entries is empty — load a wordlist first")
    words = Wordlist(allwords)

    prefix = f"{args.rows}x{args.cols}-"
    idx = max((int(p.stem[len(prefix):]) for p in LIB.glob(f"{prefix}*.json")), default=0) + 1
    rng = random.Random(args.rng_seed)

    found, valid_seen = [], 0
    for it in range(args.max_iters):
        if len(found) >= args.count:
            break
        k = rng.randint(args.blocks[0], args.blocks[1])
        t = Template(id=f"{prefix}{idx:03d}", rows=args.rows, cols=args.cols,
                     blocks=symmetric_blocks(rng, args.rows, args.cols, k))
        if validate_template(t):
            continue
        if max(c.length for c in build_constraints(t)) > args.max_len:
            continue
        valid_seen += 1
        result = fill(t, allwords, words, seed_value=idx,
                      min_seeds=args.min_seeds, deadline_s=args.deadline)
        status = "OK" if isinstance(result, FillResult) else result.reason
        print(f"[it={it}] valid={valid_seen} {t.id}: {status}", flush=True)
        if not isinstance(result, FillResult):
            continue
        (LIB / f"{t.id}.json").write_text(
            json.dumps(
                {"id": t.id, "rows": args.rows, "cols": args.cols,
                 "blocks": sorted([list(b) for b in t.blocks])},
                ensure_ascii=False, indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        found.append(t.id)
        idx += 1

    print(f"done: wrote {len(found)} templates: {found}")
    if len(found) < args.count:
        print(f"(only {len(found)}/{args.count} — try raising --max-len/--deadline or --max-iters)")


if __name__ == "__main__":
    main()
