class Wordlist:
    def __init__(self, words: list[str]):
        self._by_len: dict[int, list[str]] = {}
        seen: set[str] = set()
        for w in words:
            if len(w) < 3 or w in seen:
                continue
            seen.add(w)
            self._by_len.setdefault(len(w), []).append(w)
        for n in self._by_len:
            self._by_len[n].sort()

    def by_length(self, n: int) -> list[str]:
        return list(self._by_len.get(n, []))
