# Changelog

All notable changes to `@sharp-api/client` are documented here.

## 0.4.0 — 2026-06-02

### Changed

- `NormalizedOdds.timestamp` documented as the **delivery / last-refreshed**
  feed-freshness timestamp (advances every ingest cycle), matching OpticOdds'
  `timestamp` — NOT a price-last-changed time. The API now populates this field
  (previously always `null`). The removed `odds_changed_at` / `last_seen_at` /
  `wire_received_at` were never modeled by this SDK, so no type change is
  needed. (SHA-1048)

### Added

- `NormalizedOdds.is_active` (boolean). `false` indicates the market is
  suspended/closed with the price frozen — mirrors OpticOdds `locked-odds` but
  as a queryable field. Absent on the wire is treated as `true`.
- `'odds:locked'` `WebSocketEventType` — supplementary stream event carrying the
  suspended subset of a delta (1:1 with OpticOdds `locked-odds`). The rows also
  arrive in the normal odds update with `is_active: false`.

### Backward compatibility

- Additive optional field; existing code is unaffected.

## 0.3.2 — 2026-05-07

### Changed

- Update `repository.url` and `bugs` URLs in `package.json` to use the
  canonical `SharpAPI-TS` repo name (was lowercase `sharpapi-ts`,
  redirected by GitHub but worth making canonical on npm). Metadata-only
  release; no code changes.

## 0.3.1 — 2026-05-06

### Added — TeamRef metadata

`TeamRef` (and the `Team` reference-endpoint shape) gain five additional
optional fields:

- `logo` — full CDN URL. ~93% coverage.
- `city` — e.g. `"Arizona"` for the Diamondbacks.
- `mascot` — e.g. `"Diamondbacks"`.
- `conference` — e.g. `"NL"`, `"AFC"`, `"Western"`.
- `division` — e.g. `"West Division"`, `"NL East"`, `"Pacific Division"`.

All five default to `undefined` and are additive — older servers omit
them and 0.3.0 client code keeps working unchanged.

## 0.3.0 — 2026-05-06

### Added — nested refs

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

- `LowHoldOpportunity` — was previously untyped. Now a typed interface
  so nested refs surface alongside the flat fields.

### Backward compatibility

No existing field was renamed, retyped, or removed. Code that does not
reference the new properties continues to compile without changes.
