# SharpAPI TypeScript SDK

[![npm](https://img.shields.io/npm/v/%40sharp-api%2Fclient?color=06b6d4)](https://www.npmjs.com/package/@sharp-api/client)
[![license](https://img.shields.io/badge/license-MIT-06b6d4)](LICENSE)
[![docs](https://img.shields.io/badge/docs-docs.sharpapi.io-06b6d4)](https://docs.sharpapi.io)

Official TypeScript/JavaScript client for the [SharpAPI](https://sharpapi.io) real-time sports betting odds API.

Get pre-computed +EV opportunities, arbitrage detection, middles, and live odds from the major US sportsbooks, plus sharp books, exchanges and prediction markets, with Pinnacle as the sharp reference.

**[Documentation](https://docs.sharpapi.io/sdks/typescript)** · [API reference](https://docs.sharpapi.io/api-reference) · [Changelog](CHANGELOG.md)

## Requirements

- Node.js 20 or later. Tested on Node.js 20, 22 and 24.
- A SharpAPI key. The [free plan](https://sharpapi.io/pricing) is enough for the quick start's odds call and the demo.

## Install

```bash
npm install @sharp-api/client
```

## Quick Start

```typescript
import { SharpAPI } from '@sharp-api/client'

const api = new SharpAPI('sk_live_...')

// Get odds
const { data: odds } = await api.odds.get({ league: 'nba' })

// Get +EV opportunities
const { data: ev } = await api.ev.get({ min_ev: 3 })

// Get arbitrage opportunities
const { data: arbs } = await api.arbitrage.get({ min_profit: 1 })

// Get middles
const { data: middles } = await api.middles.get({ league: 'nba' })
```

## Runnable demo

Try the [odds-comparison app](examples/odds-comparison/): compare DraftKings and FanDuel prices in your browser, with a free API key or clearly labeled synthetic sample data. Includes setup instructions and a screenshot.

## Resources

| Resource | Methods | Tier |
|----------|---------|------|
| `api.sports` | `list()`, `get(id)` | All |
| `api.leagues` | `list(params?)`, `get(id)` | All |
| `api.sportsbooks` | `list()`, `get(id)` | All |
| `api.events` | `list(params?)`, `get(id)`, `markets(id)` | All |
| `api.odds` | `get(params?)`, `best(params?)`, `comparison(params?)`, `batch(ids)` | All |
| `api.odds` | `closing(eventId, options?)` | Pro+ |
| `api.ev` | `get(params?)` | Pro+ |
| `api.arbitrage` | `get(params?)`, `csv(params?)` | Hobby+ |
| `api.middles` | `get(params?)` | Pro+ |
| `api.gamestate` | `get(sport?)` | Game State add-on |
| `api.account` | `me()`, `usage()` | All |
| `api.stream` | `odds(params?)`, `opportunities(params?)`, `all(params?)`, `event(id)`, `oddsWs(params?)` | WebSocket add-on |

## SSE Streaming

Handlers take the server's event names, and receive each payload as sent (wire
keys, snake_case):

```typescript
import type { StreamOddsRow } from '@sharp-api/client'

const stream = api.stream.odds({ league: 'nba' })
const odds = new Map<string, StreamOddsRow>()

// A fresh connection sends a full snapshot; a resumed one replays what you missed.
stream.on('connected', ({ data }) => {
  if (!data.resumed) odds.clear()
})

// The snapshot arrives in chunks of complete rows.
stream.on('snapshot', ({ data }) => {
  for (const row of data.odds ?? []) odds.set(row.id, row)
})

// Updates are compact deltas: `id` plus the fields that change (price, line,
// is_live, is_active, timestamp). Merge each into the row you hold; a row you
// don't hold yet arrives complete.
stream.on('odds:update', ({ data }) => {
  for (const delta of data.odds) {
    odds.set(delta.id, { ...odds.get(delta.id), ...delta })
  }
})

stream.on('odds:removed', ({ data }) => {
  for (const id of data.ids) odds.delete(id)
})

stream.on('snapshot:complete', ({ data }) => console.log('live', data.total_odds))
stream.on('error', ({ data }) => console.error(data.message))

stream.connect()

// Later
stream.disconnect()
```

The odds stream also sends `odds:locked` (a market suspended, price frozen) and
`book:status`. `api.stream.opportunities()` sends `snapshot` chunks, then
`ev:detected` / `ev:expired`, and the same pair for `arb:`, `middles:` and
`low_hold:` (upsert by `id` on `detected`, delete the `expired` ids).
`api.stream.gamestate()` sends `gamestate:snapshot`, then a full slate on every
`gamestate:update`. Every stream sends `heartbeat` every 30 seconds. A
`displaced` event (a newer connection on the same API key took the stream) stops
the stream without reconnecting.

## WebSocket Streaming

Real-time push over a persistent connection. SSE delivers comparable latency: pick WS for bidirectional control (subscribe/unsubscribe, filter updates) or SSE for simpler one-way streaming behind firewalls:

```typescript
const stream = api.stream.oddsWs({
  sportsbook: ['draftkings', 'fanduel'],
  league: ['nba']
})

stream.on('connected', ({ message, tier }) => console.log(message))
stream.on('initial', ({ data }) => setAllOdds(data))
stream.on('odds_update', ({ data, source }) => updateOdds(source, data))
stream.on('ev:detected', ({ data }) => handleEV(data))
stream.on('reconnecting', ({ message }) => console.info(message))
stream.on('error', ({ message }) => console.error(message))

stream.connect()
```

When SharpAPI updates its servers it closes WebSocket connections with code 1012
("Service Restart"). The stream emits `reconnecting` for that close, not `error`,
and reconnects on its own. Until it is connected again it keeps retrying, waiting
at most 30 seconds between attempts, and reports each refused attempt as
`reconnecting` too. Any other unexpected close still emits `error`, and the stream
gives up after 5 attempts.

## Node.js

The SDK streams through the runtime's global `EventSource` and `WebSocket`.

**SSE:** Node.js has no global `EventSource`. Install the `eventsource` package and
register it before connecting:

```bash
npm install eventsource
```

```typescript
import { EventSource } from 'eventsource'
Object.assign(globalThis, { EventSource })
```

**WebSocket:** `WebSocket` is built into Node.js 22 and later. On Node.js 20,
install the `ws` package and register it the same way:

```typescript
import WebSocket from 'ws'
Object.assign(globalThis, { WebSocket })
```

## Error Handling

Authenticated REST requests reject HTTP redirects to protect API keys and request
bodies. Configure `baseUrl` with the final API origin if your gateway redirects.

```typescript
try {
  const { data } = await api.ev.get()
} catch (err) {
  if (err.code === 'rate_limited') {
    // Back off and retry
  } else if (err.code === 'tier_restricted') {
    // Upgrade plan
  } else if (err.code === 'invalid_api_key') {
    // Check API key
  }
}
```

## Links

- [Documentation](https://docs.sharpapi.io/sdks/typescript)
- [API Reference](https://docs.sharpapi.io/api-reference)
- [Python SDK](https://pypi.org/project/sharpapi/)
- [Changelog](CHANGELOG.md)
- [API status](https://status.sharpapi.io)

## Verifying a release

Versions are published to npm by GitHub Actions with a signed provenance statement
(every version since 0.2.0). To check the packages you installed:

```bash
npm audit signatures
```

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
For a security issue, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## License

[MIT](LICENSE)
