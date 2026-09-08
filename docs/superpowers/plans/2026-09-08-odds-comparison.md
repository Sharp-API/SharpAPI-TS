# Odds comparison demo implementation plan

Goal: give developers a polished, runnable free-tier example within SharpAPI-TS.

Architecture: a loopback-only Node server calls the locally built SDK. Static HTML/CSS/JS renders a responsive comparison table. API keys remain server-side. Explicit sample mode uses synthetic fixtures and never claims real-time prices. No extra runtime dependencies.

Scope: DraftKings and FanDuel, pre-match full-game two-way moneyline, MLB/NFL/NBA/NHL. Fetch one page per book (200 rows each); disclose partial coverage when pagination has more results. Compare by canonical event UUID and selection side, excluding closed/live/started markets and non-full-game variants. Pick the most recent duplicate, not the most favorable historic price. Show missing prices honestly. Manual refresh with a 30-second server cache/coalescing limits quota use. No betting recommendations or profit calculations.

Alternatives considered: a terminal example is easier but provides less visible proof; a framework app adds setup and dependency overhead. A small browser UI with a Node backend offers the clearest clone-and-run experience.

Files and sequence:
- [x] `examples/odds-comparison/demo-check.mjs`: first write failing matching, API-boundary and failure tests.
- [x] `comparison.mjs`, `sample.mjs`: implement normalization and clearly synthetic fixtures.
- [x] `server.mjs`: bounded SDK calls, safe local routing, caching and sanitized errors.
- [x] `public/index.html`, `style.css`, `app.js`: accessible responsive UI, league/format selectors, loading/error/empty states, sample label and last fetched time.
- [x] `README.md`, `.env.example`, `screenshot.png`: setup for sample and API modes, expected output, limitations, security and troubleshooting; root README discovery link.
- [x] package scripts and existing CI: build SDK then run demo tests on supported Node matrix.
- [x] Verify SDK checks, browser behavior, mobile layout and secret handling; independent review; publish protected PR.

Validation: node:test tests use injectable SDK stand-ins; browser smoke tests exercise sample mode and failures. Live smoke uses an existing authorized key if available, without saving or printing it; paid-key success is not proof of free-tier entitlement. Screenshot uses synthetic data exclusively.

Validation results: 25 SDK tests and 11 demo tests pass. SDK lint, build and both TypeScript checks pass. Browser checks cover desktop/mobile, league/format changes, partial/empty/error states and JavaScript errors. Live MLB smoke: 30 rows per book, 15 mapped events and 30 comparable outcomes. Existing account used for smoke; free-tier compatibility is based on the documented endpoint/filters, not a separate free-key test.
