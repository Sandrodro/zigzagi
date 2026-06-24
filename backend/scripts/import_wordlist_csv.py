"""Import a CSV of Georgian words (e.g. Wikidata SPARQL export) into the wordpool.

The /wordlist/bulk endpoint already validates (Georgian-only, len 3-13) and
dedupes (against wordpool_generic + within-batch), so this just extracts the
label column and POSTs it. Rejected/duplicate words are reported by the server.

Usage:
    uv run python -m scripts.import_wordlist_csv names.csv
    uv run python -m scripts.import_wordlist_csv names.csv --column label --dry-run
    uv run python -m scripts.import_wordlist_csv names.csv --url http://localhost:8000

CSV with no header: pass --no-header to use the first column.
"""

import argparse
import csv
import json
import sys
import urllib.request


def words_from_csv(path: str, column: str | None, no_header: bool) -> list[str]:
    with open(path, encoding="utf-8-sig") as f:  # utf-8-sig: strip Wikidata BOM
        if no_header:
            rows = csv.reader(f)
            return [r[0].strip() for r in rows if r and r[0].strip()]
        reader = csv.DictReader(f)
        col = column or reader.fieldnames[0]  # default: first column
        if col not in reader.fieldnames:
            sys.exit(f"column {col!r} not in {reader.fieldnames}")
        return [r[col].strip() for r in reader if r.get(col, "").strip()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--column", help="label column name (default: first)")
    ap.add_argument("--no-header", action="store_true")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--dry-run", action="store_true", help="print words, don't POST")
    args = ap.parse_args()

    words = words_from_csv(args.csv_path, args.column, args.no_header)
    words = list(dict.fromkeys(words))  # de-dup locally to shrink payload
    print(f"{len(words)} unique words from {args.csv_path}")

    if args.dry_run:
        print("\n".join(words))
        return

    payload = json.dumps({"text": " ".join(words)}).encode()
    req = urllib.request.Request(
        f"{args.url}/api/admin/wordlist/bulk",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        result = json.load(resp)

    print(f"added: {result['added']}")
    rejected = result.get("rejected", [])
    if rejected:
        print(f"rejected: {len(rejected)} (showing first 20)")
        for r in rejected[:20]:
            print(f"  {r['word']!r}: {r['reason']}")


if __name__ == "__main__":
    main()
