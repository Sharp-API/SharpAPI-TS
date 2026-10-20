// `season_type` filter serialisation and field typing.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { type Event, type NormalizedOdds, SharpAPI } from '../src/index'

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

afterEach(() => vi.unstubAllGlobals())

describe('season_type', () => {
  it('is sent on events and odds requests', async () => {
    const seen = recordUrls()
    const api = new SharpAPI('sk_test')
    await api.events.list({ season_type: 'Preseason' })
    await api.odds.get({ season_type: 'Regular Season' })
    expect(new URL(seen[0]).searchParams.get('season_type')).toBe('Preseason')
    expect(new URL(seen[1]).searchParams.get('season_type')).toBe(
      'Regular Season',
    )
  })

  it('is omitted when unset', async () => {
    const seen = recordUrls()
    const api = new SharpAPI('sk_test')
    await api.events.list()
    await api.odds.get()
    for (const u of seen)
      expect(new URL(u).searchParams.has('season_type')).toBe(false)
  })

  it('is carried on the SSE odds stream query', () => {
    const api = new SharpAPI('sk_test')
    const stream = api.stream.odds({ season_type: 'Preseason' })
    expect(JSON.stringify(stream)).toContain('season_type=Preseason')
  })

  it('is optional on the row types', () => {
    const withIt: Pick<Event, 'season_type'> = { season_type: 'Preseason' }
    const without: Pick<NormalizedOdds, 'season_type'> = {}
    expect(withIt.season_type).toBe('Preseason')
    expect(without.season_type).toBeUndefined()
  })
})
