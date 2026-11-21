import { afterEach, expect, it, vi } from 'vitest'

import { SharpAPI } from '../src/index'

afterEach(() => vi.unstubAllGlobals())

it('odds.batch exposes the grouped events response and sends filters', async () => {
  let body = ''
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      body = String(init?.body)
      return new Response(
        JSON.stringify({
          data: { events: [{ event_id: 'e1', odds: [{ market_label: 'x' }] }], missing_events: ['e2'] },
          updated_at: 't',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }),
  )
  const res = await new SharpAPI('k').odds.batch(['e1', 'e2'], { market: 'moneyline' })
  expect(res.data.events[0].event_id).toBe('e1')
  expect(res.data.missing_events).toEqual(['e2'])
  expect(JSON.parse(body)).toEqual({ event_ids: ['e1', 'e2'], market: 'moneyline' })
})
