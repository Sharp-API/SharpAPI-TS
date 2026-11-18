// `price_updated_at`, the per-row price change time: typing and raw passthrough.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { type NormalizedOdds, SharpAPI } from '../src/index'

afterEach(() => vi.unstubAllGlobals())

describe('price_updated_at', () => {
  it('is optional on NormalizedOdds', () => {
    const withIt: Pick<NormalizedOdds, 'price_updated_at'> = {
      price_updated_at: '2026-11-17T22:41:00Z',
    }
    const without: Pick<NormalizedOdds, 'price_updated_at'> = {}
    expect(withIt.price_updated_at).toBe('2026-11-17T22:41:00Z')
    expect(without.price_updated_at).toBeUndefined()
  })

  it('reaches the caller as sent, separate from timestamp', async () => {
    const row = {
      id: 'o1',
      timestamp: '2026-11-18T02:00:05Z',
      price_updated_at: '2026-11-17T22:41:00Z',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: [row] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    const res = await new SharpAPI('sk_test').odds.get()
    const got = res.data[0] as NormalizedOdds
    // A frozen price: the change time is hours older than the delivery stamp.
    expect(got.price_updated_at).toBe('2026-11-17T22:41:00Z')
    expect(got.timestamp).toBe('2026-11-18T02:00:05Z')
  })
})
