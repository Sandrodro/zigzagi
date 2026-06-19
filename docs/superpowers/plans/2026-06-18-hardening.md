# Hardening — Plan Outline

> **Fidelity: OUTLINE.** Task-level only — files, interfaces, named tests/targets. Expand each
> task to bite-sized before building. Runs last; depends on all earlier plans.

**Goal:** Make Zigzagi shippable and keepable: AI eval harnesses with KPI gates, structured
observability with the DESIGN.md §10 metrics, mobile-input verification, performance budgets, and
a deploy + rollback path.

**Tech Stack:** pytest for eval harnesses; structured JSON logging; the container host + managed
Postgres from DESIGN.md §1; feature flags + reversible migrations for rollback.

## Global Constraints (DESIGN.md §9, §10, §11)

- **Solver validated by deterministic tests, not model evals** (already in the Solver plan).
- **Never log secrets or full article bodies**; log admin publish/unpublish as audit events.
- **Reversible migrations**; snapshot before schema change; feature-gate WebGL background and
  per-source scraping so they disable without redeploy.

## Task List

1. **Extraction eval harness (KPI gate).**
   - Asset: a 10-article Georgian gold set with expected extracted words + expected drops.
   - Interface: `evals/extraction.py::score(gold, predicted) -> {precision, filter_accuracy}`.
   - Gate (DESIGN.md §9): **Precision@all ≥ 0.70**, **filter accuracy = 100%** (every non-Georgian
     / out-of-length token dropped). Test runs against the gold set; fails the build below gate.

2. **Clue benchmark harness (KPI gate).**
   - Asset: 50 `(answer, theme)` pairs.
   - Interface: `evals/clues.py::run(benchmark, client) -> report`; a regression record so prompt
     changes are compared run-over-run. Production metric: accept-or-minor-edit **≥ 80%** (from the
     Clues plan's `accept_rate`, surfaced here as a tracked dashboard number).
   - Test: harness runs with a recorded/faked client deterministically; flags regressions.

3. **Structured logging + metrics.**
   - Interface: a logging setup emitting JSON for every API / AI / scrape / fill call with the
     §10 metric fields: `solver.fill_duration`, `solver.success_rate`, `gemini.latency`,
     `gemini.error_rate`, `clue.accept_rate`, `publish.runway_days`, `scrape.success` per source,
     `play.api_latency`, `play.error_rate`. Alert thresholds per §10.
   - Tests: a fill job emits `solver.fill_duration`; secrets/article bodies never appear in logs
     (assert a redaction filter).

4. **Rate limiting + audit log.**
   - Interface: rate-limit middleware on public Play + auth endpoints; an `AuditEvent` row for
     admin publish/unpublish.
   - Tests: over-limit returns 429; scheduling a puzzle writes an audit row.

5. **Performance budgets (RUM + lab).**
   - Targets (DESIGN.md §9, §12): Play interactive **≤ 2.0 s** on mid-range mobile; background
     **≥ 50 fps**; Play API p95 **≤ 1 s**. Lab check via Lighthouse/WebPageTest profile; RUM
     hooks report `play.tti` / `bg.fps`.
   - Deliverable: a recorded baseline + a CI budget check on the built bundle size/TTI.

6. **Mobile-input E2E.**
   - Full solve loop on iOS Safari + Android Chrome: Georgian on-screen keyboard, check/reveal,
     congrats, reduced-motion auto-disable. Deliverable: documented device matrix, zero blocking bugs.

7. **Deploy + rollback.**
   - Provision managed Postgres + container host + CI (the part of DESIGN.md §7 Phase 0 not covered
     by the Walking Skeleton). Reversible migrations, image-tag rollback, feature flags for the
     WebGL background and each scrape source.
   - Rollback triggers wired (DESIGN.md §11): Play error rate > 5% (5 min) → roll back image;
     solver success < 50% after a change → revert; a misbehaving source → kill via flag; migration
     failure → stop. Keep runway ≥ 7 so a rollback never empties the Play view.
   - Deliverable: a documented runbook + a rehearsed rollback.

## Self-Review hook

Each KPI gate (Tasks 1, 2, 5) must **fail the build / block launch** when under target, not just
report — that's the point of putting them in hardening. Confirm the §10 metric names emitted in
Task 3 match the alert thresholds the runbook in Task 7 references.
