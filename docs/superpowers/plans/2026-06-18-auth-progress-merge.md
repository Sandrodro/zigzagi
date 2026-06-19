# Auth + Progress Merge + Streak — Plan Outline

> **Fidelity: OUTLINE.** Task-level only — files, interfaces, named tests. Expand each task to
> bite-sized before building. Depends on the Walking Skeleton (Progress shape, Play API) and the
> Play View (Full) plan (local persistence shape).

**Goal:** Optional Google sign-in for players; persist signed-in progress server-side; **merge**
a player's anonymous local progress into their account on first sign-in; compute a
**consecutive-day streak**. Plus the single-admin Google gate for `/api/admin/*`.

**Architecture:** Google OAuth only — store `google_sub` + email, **no passwords** (DESIGN.md
§6.7, §8). `Progress.owner_key` is a uniform string: `user:{id}` or `anon:{client_id}`, so merge
is a key rewrite (DESIGN.md §4.5). The subtle part — flagged in the planning review — is the
**merge** when both an anon row and a user row exist for the same date; this gets its own task
with explicit semantics tests, not a one-line lump.

**Tech Stack:** FastAPI + Authlib (or google-auth) for OAuth; existing SQLAlchemy/Postgres;
React for the sign-in button + merge trigger.

## Global Constraints (DESIGN.md §6.7, §8)

- **Players:** Google OAuth only; persist `google_sub` + email; anonymous is the default.
- **Admin:** single admin, Google sign-in restricted to one allowlisted email; gates **all**
  `/api/admin/*` routes (retrofit the Sourcing/Solver/Clues/Publishing admin routers).
- **Secrets** (OAuth client id/secret) server-side only, via env.
- **PII minimal:** email + `google_sub` only; rate-limit auth endpoints.

## Task List

1. **`User` + `Progress` models.**
   - `User(id, google_sub unique, email, created_at)`; `Progress(id, owner_key, puzzle_id,
     fills jsonb, timer_seconds, completed_at)` with a unique index on `(owner_key, puzzle_id)`.
   - Tests: two progress rows with the same `(owner_key, puzzle_id)` rejected; different owners ok.

2. **Google OAuth flow (`/auth/google/*`).**
   - Interfaces: `GET /auth/google/login` → redirect; `GET /auth/google/callback` → verify,
     upsert `User` by `google_sub`, issue a session cookie/JWT; `current_user` dependency.
   - Tests: callback with a faked verified token creates/links a `User` and sets the session
     (mock the token verifier — no live Google).

3. **Admin gate.**
   - Interface: `require_admin` dependency — `current_user.email == settings.ADMIN_EMAIL`, else 403.
   - Apply to every `/api/admin/*` router. Tests: non-admin → 403; admin → 200; anonymous → 401.

4. **Signed-in progress upsert.**
   - Interface: `PUT /api/play/progress {puzzle_id, fills, timer_seconds, completed_at?}` →
     upsert `Progress` with `owner_key = user:{current_user.id}` (401 if anonymous).
   - Tests: upsert creates then updates the same row; rejects anonymous.

5. **Merge-on-sign-in (the subtle one).**
   - Interface: `progress.merge_anon_into_user(db, client_id, user_id) -> int`.
   - Semantics (test each):
     - anon row exists, no user row for that date → **rekey** anon → `user:{id}`.
     - both exist for the same date → keep the **more-complete** one (prefer `completed_at`
       set; else the larger `len(fills)`); delete the loser; never leave two rows for the date.
     - neither exists → no-op.
   - Trigger: called in the OAuth callback (or a `POST /api/play/progress/merge {client_id}`
     right after sign-in). Tests cover all three branches + idempotency (running twice is safe).

6. **Consecutive-day streak.**
   - Interface: `progress.streak(db, user_id, today) -> int` — longest run of consecutive days
     ending at the most recent `completed_at` date for that user.
   - Tests: 3 consecutive completed days → 3; a gap resets; today incomplete but yesterday done →
     still counts up to yesterday per the chosen definition (decide + test explicitly).

7. **Frontend: sign-in button + merge trigger + streak display.**
   - On sign-in success, call merge with the local `client_id`, then switch reads/writes from
     `localStorage` to the server. Show the streak count.
   - Tests (api mocked): after sign-in, `merge` called with the stored `client_id`; streak rendered.

## Self-Review hook

The merge (Task 5) is the highest-risk piece — its three branches and idempotency are the
acceptance bar. Confirm `Progress.fills` shape equals the Play View plan's local shape before
wiring Task 7. Retrofitting `require_admin` (Task 3) touches every admin router built in earlier
plans — do it as one sweep and re-run those plans' endpoint tests with an admin session fixture.
