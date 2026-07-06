# Zigzagi iOS App — Design

Date: 2026-07-06
Status: approved

## Summary

A native SwiftUI iOS app for the **Play** surface only (daily solve + published-puzzle list), with **offline solve**. The web project stays as-is; the Admin Studio remains web-only. The app lives in this repo under `ios/`.

## Decisions

| Question | Decision |
|---|---|
| Scope | Play only (list + solve). No admin. |
| Tech | Native SwiftUI rebuild, iOS 17+. No web wrapper. |
| Offline | Yes — downloaded puzzles are fully solvable offline, including check/reveal. |
| Repo | Monorepo: `ios/` next to `backend/` and `frontend/`. Single API contract, single commit for cross-cutting changes, solo dev on `main`. Split later only if ownership/release cadence diverges. |
| Accounts/sync | None. Progress is device-local. |

## Backend change (the only one)

New endpoint: `GET /api/play/puzzles/by-id/{puzzle_id}/bundle`

Returns exactly `to_play_dto(puzzle)` **plus** `"solution": [{"row", "col", "value"}, ...]` (the same map `build_answer_map` produces, serialized). Published puzzles only, same guards as the existing by-id route.

- This is the **sanctioned exception** to the "answers never leave the server" invariant. The invariant remains true for the web Play API (`/puzzles/today`, `/puzzles/{date}`, `/puzzles/by-id/{id}`, check, reveal — all unchanged). DESIGN.md and CLAUDE.md get a one-line amendment noting the exception.
- No auth/obfuscation. It's a crossword; add a static app token later if scraping ever matters.
- Existing `GET /api/play/puzzles` (list) is reused by the app unchanged.

## iOS app architecture (`ios/`)

SwiftUI, iOS 17+, no third-party dependencies (URLSession, Codable, Observation — stdlib covers everything).

### Modules (groups in one app target + a test target)

1. **Engine** — `CrosswordEngine`: a mechanical Swift port of `frontend/src/engine/crossword.ts` (~245 lines, pure, framework-agnostic). Same responsibilities: active cell, direction, navigation (typing advance, backspace, arrow/tap moves), cell statuses (`empty/filled/correct/incorrect/revealed`), check/reveal scopes (`square/word/puzzle`). One difference from web: check/reveal take the locally stored solution instead of calling the server. Ported unit tests mirror the existing Vitest suite in `frontend/src/engine/__test__/` — behavior parity is verified, not assumed.
2. **Models** — `Codable` structs mirroring the DTOs: `PuzzleData` (id, date, size, blocks, absent, numbered cells, clues) matching `frontend/src/engine/types.ts`, plus `PuzzleBundle = PuzzleData + solution`, `PuzzleListItem`.
3. **API client** — thin `URLSession` wrapper: `listPuzzles()`, `fetchBundle(id:)`. Base URL configurable (Debug → localhost, Release → prod).
4. **Store** — `PuzzleStore`: bundles and solve progress as JSON files in Application Support, keyed by puzzle id (`bundle-<id>.json`, `progress-<id>.json`). Progress = fills map, cell statuses, elapsed seconds, completed flag. No SwiftData/CoreData — a handful of small documents.
5. **UI** —
   - `PuzzleListView`: published puzzles (date-sorted), download/downloaded indicator, solve state. On launch with network: refresh list, auto-fetch today's bundle.
   - `PlayView`: grid (SwiftUI `Canvas` — 11×11), clue bar, clue-list sheet, toolbar (check/reveal menus, timer, pause), congrats overlay. Haptics on completion.
   - `GeorgianKeyboardView`: custom on-screen keyboard, 33 Georgian letters (U+10D0–U+10FF) + backspace + direction toggle. No system keyboard — no autocorrect fights, full layout control.

### Data flow

launch → refresh list + fetch today's bundle → store → open puzzle → engine initialized from bundle + saved progress → keystrokes mutate engine → progress persisted (debounced + on background) → check/reveal resolved locally from `bundle.solution` → all correct → congrats.

Offline: list and any cached bundle open fine; uncached puzzles show a "needs connection" state.

### Error handling

- Network failures: non-blocking banner on list refresh; explicit retry on bundle download.
- Corrupt/missing progress file: start fresh (log, don't crash).
- 404 bundle (unpublished since caching): drop from list on next successful refresh; cached copy still playable.

## Testing

- Backend: pytest for the bundle endpoint (published-only guard, solution matches `build_answer_map`, shape).
- iOS: XCTest for the engine port (ported from Vitest suite) and the store (round-trip, corrupt-file recovery). UI is exercised manually — no UI-test suite for MVP.

## Phases

1. Backend bundle endpoint + tests + invariant doc amendment
2. Xcode project scaffold in `ios/`, models, API client, puzzle list screen
3. Swift engine port + ported unit tests
4. Play screen: grid, Georgian keyboard, clue bar/list, local check/reveal
5. Offline: bundle caching, progress persistence, launch refresh
6. Polish: timer, pause, congrats, haptics, app icon, TestFlight

## Explicitly out of scope (add later without rework)

Accounts/sync, push notifications, widgets, iPad layout, answer obfuscation, streaks/stats, admin on mobile.
