from collections import Counter

from sqlalchemy.orm import Session

from app.ai.client import GeminiClient
from app.models import Entry, Puzzle
from app.services.wordlist import add_word, block_word
from app.sourcing.validate import is_georgian_word


def _cells(entry: Entry) -> list[tuple[int, int]]:
    r, c = entry.row, entry.col
    out = []
    for _ in range(len(entry.answer)):
        out.append((r, c))
        if entry.direction == "across":
            c += 1
        else:
            r += 1
    return out


def entry_pattern(puzzle: Puzzle, entry: Entry) -> str:
    counts: Counter[tuple[int, int]] = Counter()
    for e in puzzle.entries:
        counts.update(_cells(e))
    chars = []
    for idx, cell in enumerate(_cells(entry)):
        chars.append(entry.answer[idx] if counts[cell] >= 2 else "_")
    return "".join(chars)


def _fits(word: str, pattern: str) -> bool:
    return len(word) == len(pattern) and all(p == "_" or p == ch for p, ch in zip(pattern, word))


def check_and_fix_entry(db: Session, puzzle: Puzzle, entry: Entry, ai: GeminiClient) -> dict:
    pattern = entry_pattern(puzzle, entry)
    verdict = ai.check_word(entry.answer, pattern, len(entry.answer))
    if verdict.valid:
        return {"valid": True, "replaced_with": None}
    block_word(db, entry.answer)
    repl = verdict.replacement
    if repl and _fits(repl, pattern) and is_georgian_word(repl):
        add_word(db, repl)
        entry.answer = repl
        db.flush()
        return {"valid": False, "replaced_with": repl}
    return {"valid": False, "replaced_with": None}


def check_puzzle(db: Session, puzzle: Puzzle, ai: GeminiClient) -> dict:
    replaced = []
    invalid = 0
    # snapshot entries first; we mutate answers as we go
    for entry in list(puzzle.entries):
        old = entry.answer
        out = check_and_fix_entry(db, puzzle, entry, ai)
        if not out["valid"]:
            invalid += 1
            if out["replaced_with"]:
                replaced.append({
                    "number": entry.number, "direction": entry.direction,
                    "old": old, "new": out["replaced_with"],
                })
    return {"checked": len(puzzle.entries), "invalid": invalid, "replaced": replaced}
