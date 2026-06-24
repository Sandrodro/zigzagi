import re

# Runs of >=3 Georgian letters; punctuation, digits, latin and short words drop out.
_GEORGIAN_RUN = re.compile(r"[ა-ჿ]{3,}")


def filter_article(text: str) -> list[str]:
    """Extract Georgian word candidates from raw article text, order-preserving + deduped."""
    return list(dict.fromkeys(_GEORGIAN_RUN.findall(text)))
