_GE_LO, _GE_HI = 0x10D0, 0x10FF


def is_georgian_word(w: str) -> bool:
    return bool(w) and all(_GE_LO <= ord(ch) <= _GE_HI for ch in w)


def valid_length(w: str, lo: int = 3, hi: int = 13) -> bool:
    return lo <= len(w) <= hi


def revalidate(words: list[str], lo: int = 3, hi: int = 13) -> tuple[list[str], int]:
    kept = [w for w in words if is_georgian_word(w) and valid_length(w, lo, hi)]
    return kept, len(words) - len(kept)
