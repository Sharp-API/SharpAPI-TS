# @sharpapi/client

Official TypeScript/JavaScript client for the [SharpAPI](https://sharpapi.io) real-time sports betting odds API.

Get pre-computed +EV opportunities, arbitrage detection, middles, and live odds from 20+ sportsbooks — with Pinnacle as the sharp reference.

## Install

```bash
npm install @sharpapi/client
```

## Quick Start

```typescript
import { SharpAPI } from '@sharpapi/client'

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

## Resources

| Resource | Methods | Tier |
|----------|---------|------|
| `api.sports` | `list()`, `get(id)` | All |
| `api.leagues` | `list(params?)`, `get(id)` | All |
| `api.sportsbooks` | `list()`, `get(id)` | All |
| `api.events` | `list(params?)`, `get(id)`, `markets(id)` | All |
| `api.odds` | `get(params?)`, `best(params?)`, `comparison(params?)`, `batch(ids)` | All |
| `api.ev` | `get(params?)` | Pro+ |
| `api.arbitrage` | `get(params?)`, `csv(params?)` | Hobby+ |
| `api.middles` | `get(params?)` | Pro+ |
| `api.account` | `me()`, `usage()` | All |
| `api.stream` | `odds(params?)`, `opportunities(params?)`, `all(params?)`, `event(id)`, `oddsWs(params?)` | WebSocket add-on |

## SSE Streaming

```typescript
const stream = api.stream.odds({ league: 'nba' })

stream.on('initial', ({ data }) => {
  console.log('Snapshot:', data)
})

stream.on('update', ({ data }) => {
  console.log('Update:', data)
})

stream.connect()

// Later
stream.disconnect()
```

## WebSocket Streaming

Lower latency (~100ms vs 1-2s for SSE):

```typescript
const stream = api.stream.oddsWs({
  sportsbook: ['draftkings', 'fanduel'],
  league: ['nba']
})

stream.on('connected', ({ message, tier }) => console.log(message))
stream.on('initial', ({ data }) => setAllOdds(data))
stream.on('odds_update', ({ data, source }) => updateOdds(source, data))
stream.on('ev:detected', ({ data }) => handleEV(data))
stream.on('error', ({ message }) => console.error(message))

stream.connect()
```

## Node.js

For SSE streaming in Node.js, install the `eventsource` package:

```bash
npm install eventsource
```

WebSocket is available natively in Node.js 21+ or via the `ws` package.

## Error Handling

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
