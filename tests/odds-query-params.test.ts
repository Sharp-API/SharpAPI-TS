// Outgoing query keys for the odds endpoints, pinned against the server vocabulary.
//
// The API accepts the event filter under the canonical name `event_id` and the
// live filter under `is_live`. `event`, `events`, `event_ids` and `live` are
// legacy aliases: the server still answers them, but with `Deprecation: true`
// and a `Warning: 299` header.
//
// `buildUrl` copies the params object straight into the query string, so the
// field name on the params interfaces IS the wire key — which put every SDK
// caller on the deprecated path. `canonicalFilterParams`, applied inside
// `buildUrl`, now translates both aliases, and these tests pin it.
//
// Nothing else can catch this: an alias request succeeds and returns ordinary
// rows, so no response-shape test can tell the two spellings apart.

import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SharpAPI } from '../src/index'

const EVENT_IDS = ['evt_alpha', 'evt_beta']
const EXPECTED_CSV = 'evt_alpha,evt_beta'

/** Stub fetch, recording every request URL, and answer with an empty page. */
function recordUrls(): string[] {
  const seen: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      seen.push(String(input))
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  return seen
}

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams
}

afterEach(() => vi.unstubAllGlobals())

const CALLS: Array<[string, string, (c: SharpAPI, p: object) => Promise<unknown>]> = [
  ['odds.get', '/api/v1/odds', (c, p) => c.odds.get(p)],
  ['odds.best', '/api/v1/odds/best', (c, p) => c.odds.best(p)],
  ['odds.comparison', '/api/v1/odds/comparison', (c, p) => c.odds.comparison(p)],
]

describe('event filter uses the canonical wire key', () => {
  for (const [name, path, call] of CALLS) {
    it(`${name} sends event_id, not the deprecated event alias`, async () => {
      const seen = recordUrls()
      const client = new SharpAPI('sk_test')

      await call(client, { event: EVENT_IDS })

      expect(seen).toHaveLength(1)
      const url = new URL(seen[0])
      expect(url.pathname).toBe(path)

      const params = paramsOf(seen[0])
      expect(params.get('event_id')).toBe(EXPECTED_CSV)
      // Absent, not merely accompanied: sending both spellings is still an
      // alias request as far as the server is concerned.
      expect(params.has('event')).toBe(false)
      expect(params.has('events')).toBe(false)
      expect(params.has('event_ids')).toBe(false)
    })
  }

  it('passes a single event id through unchanged, under the canonical key', async () => {
    const seen = recordUrls()
    const client = new SharpAPI('sk_test')

    await client.odds.get({ event: 'evt_alpha' })

    const params = paramsOf(seen[0])
    expect(params.get('event_id')).toBe('evt_alpha')
    expect(params.has('event')).toBe(false)
  })

  it('leaves the other filters alone', async () => {
    const seen = recordUrls()
    const client = new SharpAPI('sk_test')

    await client.odds.get({ event: 'evt_alpha', sport: 'baseball', limit: 5 })

    const params = paramsOf(seen[0])
    expect(params.get('event_id')).toBe('evt_alpha')
    expect(params.get('sport')).toBe('baseball')
    expect(params.get('limit')).toBe('5')
  })

  it('sends neither spelling when no event filter is given', async () => {
    const seen = recordUrls()
    const client = new SharpAPI('sk_test')

    await client.odds.get({ sport: 'baseball' })

    const params = paramsOf(seen[0])
    expect(params.get('sport')).toBe('baseball')
    expect(params.has('event_id')).toBe(false)
    expect(params.has('event')).toBe(false)
  })

  it('omitting params entirely still works', async () => {
    const seen = recordUrls()
    const client = new SharpAPI('sk_test')

    await client.odds.get()

    expect(paramsOf(seen[0]).has('event')).toBe(false)
  })

  it('does not send add_sportsbook (removed — API answers 400)', async () => {
    const seen = recordUrls()
    const client = new SharpAPI('sk_test')

    await client.odds.get({ sport: 'baseball' })

    expect(paramsOf(seen[0]).has('add_sportsbook')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The `live` filter — the other half of the same problem.
//
// `live` is the deprecated alias of `is_live`. It reached the wire from three
// different param types, and the old fix covered only the odds methods, so
// `events.list` and `middles.get` kept sending the alias. The rewrite now sits
// in `buildUrl`, which every query key passes through, so this suite covers
// one resource per param type that carries the filter.

const LIVE_CALLS: Array<
  [string, string, (c: SharpAPI, p: { live?: boolean }) => Promise<unknown>]
> = [
  // OddsParams
  ['odds.get', '/api/v1/odds', (c, p) => c.odds.get(p)],
  ['odds.best', '/api/v1/odds/best', (c, p) => c.odds.best(p)],
  // EventsParams — was NOT covered before.
  ['events.list', '/api/v1/events', (c, p) => c.events.list(p)],
  // MiddlesParams — was NOT covered before.
  [
    'middles.get',
    '/api/v1/opportunities/middles',
    (c, p) => c.middles.get(p),
  ],
]

describe('live filter uses the canonical wire key', () => {
  for (const [name, path, call] of LIVE_CALLS) {
    it(`${name} sends is_live, not the deprecated live alias`, async () => {
      const seen = recordUrls()
      const client = new SharpAPI('sk_test')

      await call(client, { live: true })

      expect(seen).toHaveLength(1)
      expect(new URL(seen[0]).pathname).toBe(path)

      const params = paramsOf(seen[0])
      expect(params.get('is_live')).toBe('true')
      expect(params.has('live')).toBe(false)
    })
  }

  it('keeps live: false, which is a real filter and not an absence', async () => {
    // `false` means prematch-only. A truthiness check anywhere on this path
    // would drop it and silently widen the query to everything — a
    // caller-visible behaviour change with no error.
    const seen = recordUrls()
    const client = new SharpAPI('sk_test')

    await client.odds.get({ live: false })

    const params = paramsOf(seen[0])
    expect(params.get('is_live')).toBe('false')
    expect(params.has('live')).toBe(false)
  })

  it('drops an explicitly-undefined alias rather than sending it empty', async () => {
    // `buildUrl` skips undefined values, so an explicit `live: undefined` must
    // not come back as `is_live=undefined` — the rewrite has to preserve that.
    const seen = recordUrls()
    const client = new SharpAPI('sk_test')

    await client.odds.get({ live: undefined, sport: 'baseball' })

    const params = paramsOf(seen[0])
    expect(params.get('sport')).toBe('baseball')
    expect(params.has('is_live')).toBe(false)
    expect(params.has('live')).toBe(false)
  })

  it('lets an explicit canonical key win over the alias', async () => {
    // Matches the server's own canonical-over-alias precedence, so a caller
    // passing both gets the same answer the server would have given.
    const seen = recordUrls()
    const client = new SharpAPI('sk_test')

    await client.odds.get({ live: true, is_live: false } as Record<
      string,
      unknown
    >)

    const params = paramsOf(seen[0])
    expect(params.get('is_live')).toBe('false')
    expect(params.has('live')).toBe(false)
  })

  it('leaves params with no alias in them untouched', async () => {
    const seen = recordUrls()
    const client = new SharpAPI('sk_test')

    await client.odds.get({ sport: 'baseball', limit: 5 })

    const params = paramsOf(seen[0])
    expect(params.get('sport')).toBe('baseball')
    expect(params.get('limit')).toBe('5')
    expect(params.has('is_live')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The SDK identifies itself with `User-Agent: sharpapi-ts/<version>`.

describe('User-Agent', () => {
  /** Stub fetch, recording the init so headers can be inspected. */
  function recordInits(): RequestInit[] {
    const seen: RequestInit[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init ?? {})
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )
    return seen
  }

  it('sends a sharpapi-ts User-Agent the server can attribute', async () => {
    const seen = recordInits()
    const client = new SharpAPI('sk_test')

    await client.odds.get({ sport: 'baseball' })

    const headers = seen[0].headers as Record<string, string>
    // The prefix is what the server matches on, so assert that rather than an
    // exact string a version bump would break.
    expect(headers['User-Agent']).toMatch(/^sharpapi-ts\/\d+\.\d+\.\d+/)
  })

  it('still sends the auth and content-type headers', async () => {
    // The User-Agent was added to this object; pin that it did not displace
    // anything that was already there.
    const seen = recordInits()
    const client = new SharpAPI('sk_test')

    await client.odds.get()

    const headers = seen[0].headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('sk_test')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('reports the version in package.json', async () => {
    // The version is a hand-maintained constant, so it rots silently without
    // this.
    const seen = recordInits()
    const client = new SharpAPI('sk_test')

    await client.odds.get()

    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    const headers = seen[0].headers as Record<string, string>
    expect(headers['User-Agent']).toBe(`sharpapi-ts/${pkg.version}`)
  })
})
