"""Search for valid, fillable crossword templates and write them to the library.

Templates are a curated library (see CLAUDE.md): each candidate must pass
`validate_template` (symmetry, connectivity, slot-density band) AND actually fill
against the live DB wordlist before it's written. Random search, so most density
levers are about steering toward grids the solver can fill fast.

Density levers:
  --max-len     reject any entry longer than this. THE dominant lever — capping
                length kills full-row/col entries that make grids dense and time
                out the solver. Lower = sparser, easier. (default 10)
  --blocks      "MIN MAX" black-square count (placed in 180°-symmetric pairs).
                More blocks = more breaks = shorter entries. (default 10 18)
  slot band     fraction-of-area slot count, set by SLOT_DENSITY_MIN/MAX in
                app/solver/templates.py (also gates shipped templates, so it
                lives there, not here). Lower band = sparser.

Slot-length distribution (match the dataset, not just density):
  --max-short-frac  cap fraction of slots with length<=4. Our lemma pool is thin
                    on short words, so keep this low (~0.30) for fewer 3/4s.
  --min-core-frac   floor on fraction of slots with length 5..9 (the abundant
                    middle of the distribution). ~0.55 leans the grid there.
  --max-long        cap count of length>=10 slots (those are scarce + hard to
                    fill on the lemma pool). ~3-4 = "a little number of 10s".
  Fewer blocks shifts mass off short slots onto core/long — pair with --max-len.

Usage:
  uv run python -m scripts.gen_templates                 # 5 fresh 10x10s
  uv run python -m scripts.gen_templates --max-len 7 --blocks 12 20 --count 3
  # dataset-shaped, lemma-verified 12x12:
  uv run python -m scripts.gen_templates --rows 12 --cols 12 --max-short-frac 0.30 \\
      --min-core-frac 0.55 --max-long 4 --blocks 18 24 --pool lemmas --verify-seeds 3 --min-seeds 0
"""
import argparse
import json
import random
from pathlib import Path

from app.db import SessionLocal
from app.models import WordpoolLemma
from app.solver.index import Wordlist
from app.solver.model import build_constraints
from app.solver.run import FillResult, fill
from app.solver.templates import Template, validate_template

LIB = Path(__file__).resolve().parents[1] / "app" / "solver" / "templates"


def cross_ratio(t):
    """Fraction of white cells that are crossed by BOTH an across and a down word.
    Lower = words overlap less (more unchecked cells, airier interlock)."""
    blocks = t.blocks
    def in_word(r, c, dr, dc):
        prev = 0 <= r - dr < t.rows and 0 <= c - dc < t.cols and (r - dr, c - dc) not in blocks
        nxt = 0 <= r + dr < t.rows and 0 <= c + dc < t.cols and (r + dr, c + dc) not in blocks
        return prev or nxt
    play = [(r, c) for r in range(t.rows) for c in range(t.cols) if (r, c) not in blocks]
    crossed = sum(1 for (r, c) in play if in_word(r, c, 0, 1) and in_word(r, c, 1, 0))
    return crossed / len(play)


def len_buckets(t):
    """(#slots, short, core, long) where short=len<=4, core=5..9, long=len>=10.
    The shape lever: a dataset light on short words wants few `short` slots and
    mostly `core` ones (see CLAUDE.md lemma length distribution)."""
    lens = [c.length for c in build_constraints(t)]
    short = sum(1 for n in lens if n <= 4)
    core = sum(1 for n in lens if 5 <= n <= 9)
    long_ = sum(1 for n in lens if n >= 10)
    return len(lens), short, core, long_


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
    ap.add_argument("--max-len", type=int, default=10, help="reject entries longer than this")
    ap.add_argument("--blocks", type=int, nargs=2, metavar=("MIN", "MAX"), default=[10, 18])
    ap.add_argument("--slot-band", type=float, nargs=2, metavar=("MIN", "MAX"), default=None,
                    help="override slot-density band (fraction of area); widen for low --max-len")
    ap.add_argument("--max-cross-ratio", type=float, default=None,
                    help="reject templates where >this fraction of white cells are crossed by "
                         "both an across+down word. Lower = less overlapping words (default off)")
    ap.add_argument("--min-cross-ratio", type=float, default=None,
                    help="reject templates below this crossing ratio; pair with --max for a band")
    ap.add_argument("--min-seeds", type=int, default=10, help="fill verification min_seeds")
    ap.add_argument("--deadline", type=float, default=10.0, help="fill deadline seconds")
    ap.add_argument("--max-short-frac", type=float, default=None,
                    help="reject grids where >this fraction of slots are short (length<=4); "
                         "lower = match a dataset with few short words")
    ap.add_argument("--min-core-frac", type=float, default=None,
                    help="reject grids where <this fraction of slots are 'core' (length 5..9)")
    ap.add_argument("--max-long", type=int, default=None,
                    help="reject grids with more than this many long slots (length>=10)")
    ap.add_argument("--pool", choices=("generic", "lemmas"), default="generic",
                    help="which wordpool to verify fills against (lemmas = the binding constraint)")
    ap.add_argument("--verify-seeds", type=int, default=1,
                    help="require a fill to succeed for THIS many distinct seeds before writing "
                         "(production uses a random seed, so >1 guards against seed-luck)")
    ap.add_argument("--rng-seed", type=int, default=42, help="RNG seed (reproducible search)")
    ap.add_argument("--max-iters", type=int, default=500_000)
    args = ap.parse_args()

    db = SessionLocal()
    allwords = [w for (w,) in db.query(WordpoolLemma.word).filter(WordpoolLemma.status == "active")]
    if not allwords:
        raise SystemExit("lemma wordpool is empty — load lemmas first")
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
        if validate_template(t, tuple(args.slot_band)) if args.slot_band else validate_template(t):
            continue
        if max(c.length for c in build_constraints(t)) > args.max_len:
            continue
        nslots, short, core, long_ = len_buckets(t)
        if args.max_short_frac is not None and short / nslots > args.max_short_frac:
            continue
        if args.min_core_frac is not None and core / nslots < args.min_core_frac:
            continue
        if args.max_long is not None and long_ > args.max_long:
            continue
        cr = cross_ratio(t)
        if args.max_cross_ratio is not None and cr > args.max_cross_ratio:
            continue
        if args.min_cross_ratio is not None and cr < args.min_cross_ratio:
            continue
        valid_seen += 1
        # Require a fill for EVERY verify seed — production picks a random seed_value,
        # so a single-seed pass can be luck. Stop at the first seed that fails.
        status = "OK"
        for k in range(args.verify_seeds):
            sv = idx + k * 9973  # distinct, deterministic per (idx, k)
            result = fill(t, allwords, words, seed_value=sv,
                          min_seeds=args.min_seeds, deadline_s=args.deadline)
            if not isinstance(result, FillResult):
                status = f"seed {sv}: {result.reason}"
                break
        print(f"[it={it}] valid={valid_seen} {t.id} cross={cross_ratio(t):.2f} "
              f"x{args.verify_seeds} on {args.pool}: {status}", flush=True)
        if status != "OK":
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
