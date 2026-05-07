# Changelog

All notable changes to `@sharp-api/client` are documented here.

## 0.3.0 — 2026-05-06

### Added — OpticOdds-parity nested refs (Phase 1f)

Every odds row, opportunity row, and reference-list row may now carry
optional structured reference objects alongside the existing flat fields.
All new fields are **optional and additive** — clients on older API
versions (or talking to older API servers) see `undefined` and behave
identically.

New interfaces:

- `TeamRef` — `{ id?, numerical_id?, name?, abbreviation? }` (latter only
  on team-sport competitors)
- `SportRef` — `{ id?, name?, numerical_id? }`
- `EntityRef` — `{ id?, label?, numerical_id? }` (used for league /
  market / sportsbook refs)
- `NestedRefs` — bundle (`home`, `away`, `sport_ref`, `league_ref`,
  `market_ref`, `sportsbook_ref`) extended onto row-shaped types
- `Market` — `{ market_type, market_label?, ..., numerical_id? }` for
  the `/markets` reference endpoint
- `Team` — `{ id, name?, sport?, league?, abbreviation?, numerical_id? }`
  for the `/teams` reference endpoint

Existing types now extend `NestedRefs`:

- `NormalizedOdds`, `EVOpportunity`, `ArbitrageOpportunity`,
  `MiddleOpportunity`
- `Event` extends a subset (`home`, `away`, `sport_ref`, `league_ref` —
  no per-book / per-market refs on the event row itself)

New optional fields on existing types:

- `ArbitrageLeg` — `sportsbook_ref?: EntityRef`
- `ClosingOdd` — `market_ref?: EntityRef`, `sportsbook_ref?: EntityRef`
- `ClosingSnapshot` — `home?`, `away?`, `sport_ref?`, `league_ref?`
- `Sport`, `League`, `Sportsbook` — `numerical_id?: number`

New typed shape:

- `LowHoldOpportunity` — was previously untyped. Phase 1f introduces it
  as a typed interface so nested refs surface alongside the flat fields.

### Backward compatibility

No existing field was renamed, retyped, or removed. Code that does not
reference the new properties continues to compile without changes.
