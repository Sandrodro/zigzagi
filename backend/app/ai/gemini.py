import json
from collections.abc import Callable
import logging

from pydantic import ValidationError

from app.ai.client import ClueResult, ExtractedCandidate, Suggestion, WordCheck

log = logging.getLogger(__name__)


class AIError(Exception):
    pass


def _default_transport(api_key: str):  # pragma: no cover - real network
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    def call(model: str, prompt: str, schema, think=True):
        cfg = types.GenerateContentConfig(response_mime_type="application/json")
        if not think:
            # ponytail: lemmatize/extract need no reasoning; with thinking on, the
            # model burned the whole token budget and truncated the JSON (MAX_TOKENS).
            cfg.thinking_config = types.ThinkingConfig(thinking_budget=0)
            cfg.max_output_tokens = 16384
        return client.models.generate_content(model=model, contents=prompt, config=cfg)

    return call


_EXTRACT_PROMPT = (
    "ამოიღე ქართული სიტყვები შემდეგი ტექსტიდან. "
    "დააბრუნე JSON სია ობიექტებით (surface, lemma, length, snippet, theme_relevance). "
    "არსებული პული: {pool}. ტექსტი:\n{text}"
)


# Editorial guidance + before/after corrections, injected into the clue prompt
# via the {guidance} format field.
_CLUE_GUIDANCE = """\
Lean on Georgian cultural, historical, geographical, and common-knowledge references. \
Avoid flat, mechanical, or trivially simple clues — bare dictionary definitions, \
grammar-category labels, or plain arithmetic — whenever a richer, more interesting \
angle to the same answer exists. Keep the wording concise and natural, but make the \
clue teach or delight, not merely define; it must still be fair and gettable. Weak \
clues and the missed better angle:
- მესამე პირის ნაცვალსახელი → იგი  (weak: a dry grammar label; better: clue ჯემალ \
ქარჩხაძის ცნობილ რომანს "იგი" — the same answer as a real cultural reference)
- ათჯერ ათი → ასი  (weak: bare arithmetic; prefer a fresher, culturally grounded angle)

Editorial revision examples — wordy/awkward ORIGINAL → tighter, more natural IMPROVED \
(Georgian; imitate the move toward concision and natural phrasing):
სავალი ნაწილი, რომელიც დანიშნულების ადგილამდე მიდის → სავალი ნაწილი
ძაფზე ან თოკზე შეკრული ადგილი → შეკვრის წერტილი
გაციებული ბავშვის ცხვირიდან ჩამოსული სითხე → გაციებულ ბავშვს ეს ცხვირიდან ჩამოდის
საბრალო, საცოდავი ადამიანის სინონიმი → საბრალო ადამიანი
ხალისიანი განწყობის ხმოვანი გამოხატულება, რომელსაც ტირილი უპირისპირდება → ტირილის საპირისპირო
მეტყველების ორგანოს აღმნიშვნელი სახელის ვითარებითი ბრუნვა → მეტყველების ორგანო (ვითარებითი ბრუნვა -დ)
ელექტრული მუხტის მქონე ნაწილაკი ფიზიკაში → ელექტრონული მუხტის მქონე ნაწილაკი"""


_CLUE_PROMPT = """\
Act as a master crossword constructor and editor in the tradition of a Monday New \
York Times puzzle — but native to Georgian language and culture. You are the Georgian \
equivalent of a seasoned puzzle editor: fluent in standard literary Georgian, steeped \
in everyday Georgian culture (geography, food, history, proverbs, pop references, \
everyday objects), and obsessed with fairness. You think of the solver as a bright, ordinary person on a Monday morning who \
wants to feel smart, not stumped — and who enjoys a clue that makes them smile.

Objective
You are given a JSON list of crossword answers (each item has an "entry_id" and its \
"answer"). Write exactly one clue per answer. The whole set must read like a polished, \
accessible Monday puzzle: gettable, quietly satisfying, and with personality.

Clue Style and Difficulty
Difficulty Target — accessible, not flavorless: aim for an easy early-week level. \
Clues stay fair, gettable, and rooted in common knowledge — but they need NOT be bare \
dictionary definitions or instant gimmes. A solver should reliably arrive at the \
answer, ideally with a small spark of recognition or interest on the way. A clue may \
ask for a moment of thought; it just shouldn't require decoding a puzzle within the \
puzzle. Wit Is Welcome (within Monday limits): Clues can be witty, warm, dry, or gently punny — \
just not tricky. A pun is fine as long as the answer stays obvious. The humor is a \
bonus the solver enjoys after they've already gotten the answer, never an obstacle. If \
a joke risks ambiguity, drop it and clue straight. Fairness always beats funny.
Cluing Variety: Across the set, rotate among clean clue types: straight \
synonym/definition; category-or-example; fill-in-the-blank of a well-known phrase, \
place name, proverb, or title; a sprinkling of light, affectionate humor; and — \
favored here — Georgian cultural, historical, geographical, and common-knowledge \
references. Plain definition and fill-in-the-blank are dependable anchors, but don't \
default to them: where an answer fairly allows a culturally grounded or evocative \
angle, prefer it over a bare definition.
Fairness Principle: Every clue must point to exactly one answer. No obscure trivia, no \
inside knowledge, no ambiguity. Keep clues short — ideally under ~8 words.

Linguistic and Lexical Rules
Language Base: Write all clues in clear, standard literary Georgian. Avoid heavy slang, \
dialect, or archaisms. A wink of colloquial warmth is fine; opacity is not.
Grammatical Agreement: Match the clue to the grammatical form of the answer. Default to \
nominative singular unless the answer is an inflected or plural form, in which case \
mirror it. The clue's implied part of speech must match the answer.
Proper-Noun Signaling: Georgian has no capital letters, so signal names through the \
clue itself — lead with the category ("ქალაქი...", "მდინარე...", "მწერალი...") so the \
solver knows they're after a name. For abbreviations add "(შემოკლებით)".
Anti-Give-Away Rule (strict): Never use the answer word, its root, an obvious cognate, \
OR any word that contains the answer as a substring inside its own clue. For მზე, do \
not write "მზიანი ამინდი" (მზიანი contains მზე). Enforce this on every single clue, \
jokes included.
Natural Phrasing: Avoid unnatural or contrived combination/compound words (e.g. \
წყალმცურავი). Prefer the natural, everyday word or phrase a fluent speaker would \
actually use.

Reference Examples (STYLE ONLY)
Below are real clue→answer pairs from two early-week New York Times crosswords. They \
are in ENGLISH and appear here solely to demonstrate the target straight-clue craft: \
definitional synonyms, category-or-example, fill-in-the-blank of well-known \
phrases/titles, brevity, and the occasional light wit. Study the *approach* — do NOT \
translate, reuse, echo, or be limited by these specific clues or answers. Your output \
must be original and written in Georgian.

Puzzle A:
Ritzy → POSH
Like the caboose among all the cars on a train → LAST
"Perry ___" (classic legal drama) → MASON
Iams competitor → ALPO
Regarding → ASTO
Harden (to) → INURE
When the Allied invasion of Normandy was launched → DDAY
"Movin' On Up" and "I'll Be There for You," for two → THEMESONGS
123 ___ Street (Big Bird's address) → SESAME
Clear, as a diner's table → BUS
Washington, D.C., baseball player, for short → NAT
Sound at the start of "gentle" and "giant" → SOFTG
Apply, as lotion → RUBIN
Window fixtures most used in the summer, for short → ACS
Kind of tide whose opposite is "spring" → NEAP
"That's ___ hadn't heard!" → ONEI
Board game in which pieces may be captured or crowned → CHECKERS
Reply to "Who's there?" → ITSME
Not glossy, as a photo finish → MATTE
Baby dog → PUP
Legitimate → VALID
Submission to a contest → ENTRY
Any "Jr.," to his father → NAMESAKE
Rick's love in "Casablanca" → ILSA
Composer Stravinsky → IGOR
1992's "A Few Good ___" → MEN
Run up, as expenses → INCUR
Brusque → TERSE
Victoria Beckham ___ Adams → NEE
Pic taken at arm's length → SELFIE
What draws recording artists to Nashville and jazz lovers to New Orleans → MUSICSCENE
"___ Las Vegas" (1964 film) → VIVA
Customer's routine order, with "the" → USUAL
Big rig's cargo → HAUL
401(k) alternatives, for short → IRAS
Cylindrical pasta → PENNE
On the ___ (unfriendly) → OUTS
Certain email folder → SENT
Protective gear for in-line skaters → PADS
Ye ___ shoppe → OLDE
Places to rejuvenate oneself → SPAS
Georgetown University athletes → HOYAS
Charge for an overdue payment → LATEFEE
Cigar residue → ASH
Office address abbr. → STE
Mausoleum → TOMB
Pageant whose hosts have included Bob Barker, Dick Clark and Steve Harvey → MISSUNIVERSE
Year, in Buenos Aires → ANO
Predominant religion of Indonesia and Pakistan → SUNNIISLAM
Instrument heard at a ballpark → ORGAN
Where eggs are laid → NEST
Continental currency since 2002 → EURO
Animal "relative" an astonished person may claim to be → MONKEYSUNCLE
Covering seen at a ballpark → TARP
Dashboard-mounted navigator → GPSUNIT
Greek B's → BETAS
Zenith → ACME
Martial arts action star Jackie → CHAN
What glows in the west at day's end → SETTINGSUN
PC shortcut for "copy" → CTRLC
Ike's partner in the candy aisle → MIKE
Biblical garden → EDEN
It may be turned with a swipe on an e-reader → PAGE
Scrumptious bits → MORSELS
War god who's a foe of Wonder Woman → ARES
Occupied, as a lavatory → INUSE
"It's my turn" → IMUP
Rebounding sound → ECHO
Pyromaniac's obsession → FIRE
"Ghostbusters" director Reitman → IVAN
Toward the dawn → EAST
Actor McKellen → IAN
___ de cologne → EAU
Acorn, for one → NUT

Puzzle B:
"Get out" key → ESC
Rocky outcroppings → CRAGS
According to → ASPER
Actor Mineo → SAL
Watercolor and oil, for two → MEDIA
Ingredient in laundry products → BORAX
Make a goofy appearance in someone else's picture → PHOTOBOMB
Little brats → SNOTS
"Nevermore" speaker, in poetry → RAVEN
Twins' org. → MLB
Sitcom ET from the planet Melmac → ALF
Angers → IRES
Multipost rant online → TWEETSTORM
How tuna or steak may be served → TARTARE
Annoying complainer → WHINER
Fancy → POSH
Existential dread → ANGST
What the "spinning beach ball of death" might indicate → COMPUTERCRASH
Schwarzenegger, familiarly → ARNIE
Ingredient in lemon curd → YOLK
Greyhound station freebie → BUSMAP
Crispy tortilla dish → TOSTADA
Message sent to many recipients → EMAILBLAST
Many a Mideasterner → ARAB
Rank below cpl. → PFC
Title equivalent to Dame → SIR
Foamy part of un espresso → CREMA
Bail on plans, with "out" → FLAKE
Big times in Silicon Valley → TECHBOOMS
Actress/model Bo → DEREK
Not deserved → UNDUE
Big name in jeans → LEE
Brief comment to an audience → ASIDE
Indiana pro basketballer → PACER
Throw in → ADD
Vivacity → ESPRIT
Much of Chad and Mali → SAHARA
Honey source → CLOVER
"Hurry up!" → CMON
Basketball stat: Abbr. → REB
Tizzy → ADO
"Ooh, I need that!" → GIMME
Black → SABLE
Six-pack contents → ABS
Light piano piece → SONATINA
Drags out → PROLONGS
Subway line? → EATFRESH
Pharmacy pickups → RXS
Litmus ___ → TEST
"Oh, and also...," in a text → BTW
Short pants? → TROU
Mae who said "I'll try anything once" → WEST
Ocean beasts that lack bones, surprisingly → SHARKS
Old TV star whose haircut was inspired by Mandinka warriors → MRT
Take to a higher court → APPEAL
"What's the big idea?!" → HEY
Wads, as paper → CRUMPLES
Watching the big game? → ONSAFARI
Did an impression of → MIMICKED
Goes bad → ROTS
Coagulate → CLOT
Fiver → ABE
"Nova" network → PBS
Tuber type → TARO
Anatomical ring → AREOLA
Blocked, as a river → DAMMED
Degraded → ABASED
Suddenly showed happiness → LITUP
Impressive venue to sell out → ARENA
"Good buddy" speaker → CBER
Public health org. → FDA
Barely manage, with "out" → EKE
Rose or lilac → HUE

Editorial Guidance and Corrections (apply to every clue)
{guidance}

Output
Return ONLY a JSON array, no preamble, in exactly this shape:
[{{"entry_id": "<id>", "clue": "<Georgian clue>"}}]
Include exactly one clue object per input entry, reusing each entry's "entry_id" \
verbatim.

Answers:
{batch}"""


class GeminiExtractor:
    def __init__(
        self,
        api_key,
        dumb_model,
        smart_model,
        transport: Callable | None = None,
    ):
        self.dumb_model = dumb_model
        self.smart_model = smart_model
        self._call = transport or _default_transport(api_key)

    def _parse(self, text: str, model_cls):
        return [model_cls(**row) for row in json.loads(text)]

    def extract(self, text, pool) -> list[ExtractedCandidate]:
        prompt = _EXTRACT_PROMPT.format(pool=", ".join(pool), text=text)
        for attempt in range(2):  # one bounded retry
            resp = self._call(self.dumb_model, prompt, ExtractedCandidate, think=False)
            try:
                return self._parse(resp.text, ExtractedCandidate)
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("extraction returned malformed JSON")
        raise AIError("unreachable")

    def suggest(self, pool) -> list[Suggestion]:
        prompt = f"შემოგვთავაზე ახალი ქართული სიტყვები პულის გასაფართოებლად. პული: {', '.join(pool)}. JSON სია (word, reason, in_corpus)."
        for attempt in range(2):
            resp = self._call(self.smart_model, prompt, Suggestion)
            try:
                return self._parse(resp.text, Suggestion)
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("suggestion returned malformed JSON")
        raise AIError("unreachable")

    def clue(self, batch) -> list[ClueResult]:
        prompt = _CLUE_PROMPT.format(
            batch=[r.model_dump() for r in batch], guidance=_CLUE_GUIDANCE
        )
        log.info("gemini clue start: model=%s entries=%d", self.smart_model, len(batch))
        for attempt in range(2):  # one bounded retry
            resp = self._call(self.smart_model, prompt, ClueResult)
            try:
                results = self._parse(resp.text, ClueResult)
                log.info(
                    "gemini clue ok: model=%s clues=%d attempt=%d",
                    self.smart_model,
                    len(results),
                    attempt + 1,
                )
                return results
            except (json.JSONDecodeError, ValidationError, TypeError) as exc:
                log.warning(
                    "gemini clue parse failed (attempt %d): %s; response=%.500s",
                    attempt + 1,
                    exc,
                    resp.text,
                )
                if attempt == 1:
                    raise AIError("clue generation returned malformed JSON")
        raise AIError("unreachable")

    def lemmatize(self, words, cheap=False) -> list[str]:
        # ponytail: one call for the whole article; chunk if a paste ever blows the token limit.
        # cheap=True uses the flash extract model instead of the pricier suggest model.
        prompt = (
            "For each Georgian word below, return its lemma (ლექსიკონური ძირითადი ფორმა). "
            "For an adjective derived from a noun, return the noun's lemma instead "
            "(e.g. 'ემიგრაციული' -> 'ემიგრაცია', 'სოცრეალისტური' -> 'სოცრეალიზმი'). "
            "For a word in a non-nominative case or any inflected form, return its "
            "nominative/base dictionary form (e.g. 'განედიდებინა' -> 'განდიდება'). "
            "Skip any token that is not a valid Georgian word or has no lemma. "
            "Return only a JSON array of unique lemmas (strings). "
            f"Words: {', '.join(words)}"
        )
        model = self.dumb_model if cheap else self.smart_model
        for attempt in range(2):
            resp = self._call(model, prompt, None, think=False)
            logging.info(resp)
            try:
                return [str(x) for x in json.loads(resp.text)]
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("lemmatize returned malformed JSON")
        raise AIError("unreachable")

    def check_word(self, word, pattern, length) -> WordCheck:
        prompt = (
            f"შეამოწმე, არის თუ არა '{word}' გამართული ქართული სიტყვა. "
            f"თუ არ არის, შემოგვთავაზე {length}-ასოიანი გამართული ქართული სიტყვა, "
            f"რომელიც ზუსტად შეესაბამება შაბლონს '{pattern}' "
            f"(სადაც '_' ნებისმიერი ასოა, დანარჩენი ასოები უცვლელია). "
            f'დააბრუნე მხოლოდ JSON ობიექტი: {{"valid": true|false, "replacement": "სიტყვა"|null}}.'
        )
        for attempt in range(2):
            logging.info(prompt)
            resp = self._call(self.smart_model, prompt, WordCheck)
            logging.info("%s", resp.text)
            try:
                return WordCheck(**json.loads(resp.text))
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("word check returned malformed JSON")
        raise AIError("unreachable")
