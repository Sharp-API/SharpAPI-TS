// Outgoing query keys for the odds endpoints, pinned against the server vocabulary.
//
// `/odds`, `/odds/best` and `/odds/comparison` accept the event filter under the
// canonical name `event_id`. `event`, `events` and `event_ids` are legacy
// aliases: the server still answers them, but with `Deprecation: true`, a
// `Sunset` date that has already passed and a `Warning: 299` header, and it
// counts them in its filter-alias migration metric.
//
// `buildUrl` copies the params object straight into the query string, so the
// field name on `OddsParams` is the wire key. The field is called `event`, so
// every SDK caller was on the deprecated path. `canonicalOddsParams` now
// translates it, and these tests pin the translation.
//
// Nothing else can catch this: an alias request succeeds and returns ordinary
// rows, so no response-shape test can tell the two spellings apart.

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
})
