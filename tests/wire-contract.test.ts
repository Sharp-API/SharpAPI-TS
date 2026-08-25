// Model <-> wire contract for the TypeScript SDK.
//
// TypeScript types are erased at runtime, so a wrong interface does not throw —
// it silently hands back `undefined`. Measured against the deployed API on
// 2026-08-23, 42 of 66 declared fields across six interfaces do not exist on
// the wire, so `league.name` is typed `string` and is `undefined` in practice.
// The dominant cause is casing: the interfaces are camelCase, the wire is
// snake_case, and `request()` returns the parsed body by raw cast with no key
// transform. Three fields already carry doc comments saying exactly that; the
// rest were never updated.
//
// Correcting those names is a breaking change to a published package and is
// deliberately NOT in this file's scope. What is here:
//
//   1. the one unambiguous RUNTIME bug — `"data": null` on an empty list
//   2. a ratchet that pins the known-wrong field set so it cannot grow
//
// Fixtures are real responses captured from the deployed API. Refresh them when
// the wire changes on purpose; a failure here means the wire moved.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SharpAPI } from '../src/index'

const HERE = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'))

const respondWith = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )

afterEach(() => vi.unstubAllGlobals())

// --------------------------------------------------------------------------- //
// 1. The runtime bug: an empty list arrives as `"data": null`, not `[]`
// --------------------------------------------------------------------------- //

describe('empty list results', () => {
  it('the fixture really does carry a null data, or the test below is vacuous', () => {
    expect(fixture('events-empty.json').data).toBeNull()
  })

  it('normalises `"data": null` to an empty array', async () => {
    respondWith(fixture('events-empty.json'))
    const client = new SharpAPI('sk_test')
    const res = await client.events.list({ league: 'nba', live: true })
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.data).toEqual([])
  })

  it('the returned value is safe to iterate — this threw TypeError before', async () => {
    respondWith(fixture('events-empty.json'))
    const client = new SharpAPI('sk_test')
    const res = await client.events.list({ league: 'nba', live: true })
    expect(() => res.data.map((e) => e.id)).not.toThrow()
  })

  // Control: a populated response must pass through untouched, so the fix
  // cannot be satisfied by blanket-replacing `data`.
  it('leaves a populated data array alone', async () => {
    respondWith(fixture('odds.json'))
    const client = new SharpAPI('sk_test')
    const res = await client.odds.get({ sport: 'baseball', limit: 1 })
    expect(res.data).toHaveLength(1)
    expect(res.data[0]).toEqual(fixture('odds.json').data[0])
  })

  // Control: an object-shaped `data` must not be turned into an array.
  it('leaves an object-shaped data alone', async () => {
    respondWith({ data: { tier: 'pro', features: ['odds'] } })
    const client = new SharpAPI('sk_test')
    const res = (await client.account.me()) as unknown as { data: { tier: string } }
    expect(Array.isArray(res.data)).toBe(false)
    expect(res.data.tier).toBe('pro')
  })
})

// --------------------------------------------------------------------------- //
// 2. The drift ratchet
// --------------------------------------------------------------------------- //

const SOURCE = readFileSync(join(HERE, '..', 'src', 'index.ts'), 'utf8')

/** Field names declared on an interface, comments stripped. */
function declaredFields(name: string): string[] {
  // `\b` matters: without it `Sport` also matches `SportRef` and the wrong
  // interface is measured.
  const m = new RegExp(`export interface ${name}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(SOURCE)
  if (!m) throw new Error(`interface ${name} not found`)
  const body = m[1].replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
  return body
    .split('\n')
    .map((line) => /^\s*([A-Za-z_]\w*)\??\s*:/.exec(line)?.[1])
    .filter((f): f is string => Boolean(f))
}

const wireKeys = (name: string): Set<string> => {
  const d = fixture(name).data
  return new Set(Object.keys(Array.isArray(d) ? d[0] : d))
}

// Pinned 2026-08-23. Each entry is a field the SDK declares that the deployed
// API does not send — reading it yields `undefined`, with no error. This is a
// RATCHET, not an approval: it fails if a new wrong field is added, and it
// fails when a field is corrected, at which point the fix is to delete the
// entry rather than to widen it.
const KNOWN_DRIFT: Record<string, { fixture: string; missing: string[] }> = {
  NormalizedOdds: {
    fixture: 'odds.json',
    missing: [
      'eventId', 'homeTeam', 'awayTeam', 'marketType', 'selectionType',
      'team_side', 'market_segment', 'odds', 'eventStartTime', 'isLive', 'status',
    ],
  },
  Sport: { fixture: 'sports.json', missing: ['slug', 'active', 'eventCount'] },
  League: {
    fixture: 'leagues.json',
    missing: ['name', 'slug', 'sportId', 'country', 'active'],
  },
  Sportsbook: {
    fixture: 'sportsbooks.json',
    missing: ['name', 'slug', 'active', 'features'],
  },
  EVOpportunity: {
    fixture: 'ev.json',
    missing: [
      'eventId', 'eventName', 'marketType', 'odds', 'sharpOdds', 'sharpBook',
      'fairProbability', 'evPercentage', 'kellyPercent', 'market_segment',
      'is_suspended', 'suspended_since', 'detectedAt',
    ],
  },
  ArbitrageOpportunity: {
    fixture: 'arbitrage.json',
    missing: [
      'eventId', 'eventName', 'marketType', 'profitPercent', 'impliedTotal', 'detectedAt',
    ],
  },
}

describe('declared fields vs the wire', () => {
  it('the extractor works — a known interface yields known fields', () => {
    expect(declaredFields('Sport')).toContain('id')
    expect(declaredFields('Sport')).toContain('slug')
    // The \b guard: Sport must not be measured as SportRef.
    expect(declaredFields('Sport')).not.toEqual(declaredFields('SportRef'))
  })

  it.each(Object.entries(KNOWN_DRIFT))(
    '%s drift matches the pin exactly',
    (iface, { fixture: fx, missing }) => {
      const wire = wireKeys(fx)
      const actual = declaredFields(iface).filter((f) => !wire.has(f)).sort()
      expect(actual).toEqual([...missing].sort())
    },
  )

  it('the total is 42 of 66 — update this when the retype lands', () => {
    const total = Object.keys(KNOWN_DRIFT).reduce(
      (n, i) => n + declaredFields(i).length,
      0,
    )
    const drifted = Object.values(KNOWN_DRIFT).reduce((n, d) => n + d.missing.length, 0)
    expect({ drifted, total }).toEqual({ drifted: 42, total: 66 })
  })
})
