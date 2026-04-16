import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SharpAPI, createClient } from '../src/index'
import type {
  APIResponse,
  NormalizedOdds,
  EVOpportunity,
  ArbitrageOpportunity,
  MiddleOpportunity,
  Sport,
  League,
  Sportsbook,
  Event,
  AccountInfo,
} from '../src/index'

// ─── Mock fetch ──────────────────────────────────────────────────────────────

function mockFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  })
}

function mockFetchError(code: string, message: string, status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: { code, message } }),
    text: () => Promise.resolve(JSON.stringify({ error: { code, message } })),
  })
}

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ODDS_RESPONSE: APIResponse<NormalizedOdds[]> = {
  data: [
    {
      id: 'dk_123_ml_home',
      sportsbook: 'draftkings',
      eventId: 'evt_123',
      sport: 'basketball',
      league: 'nba',
      homeTeam: 'Lakers',
      awayTeam: 'Celtics',
      marketType: 'moneyline',
      selection: 'Lakers',
      selectionType: 'home',
      odds: { american: -110, decimal: 1.909, probability: 0.524 },
      eventStartTime: '2026-03-10T00:00:00Z',
      timestamp: '2026-03-09T23:00:00Z',
      isLive: false,
      status: 'upcoming',
    },
  ],
  meta: { count: 1 },
}

const EV_RESPONSE: APIResponse<EVOpportunity[]> = {
  data: [
    {
      eventId: 'evt_123',
      eventName: 'Lakers vs Celtics',
      sport: 'basketball',
      league: 'nba',
      marketType: 'moneyline',
      selection: 'Lakers ML',
      sportsbook: 'draftkings',
      odds: { american: -105, decimal: 1.952, probability: 0.512 },
      sharpOdds: { american: -115, decimal: 1.869, probability: 0.535 },
      sharpBook: 'pinnacle',
      fairProbability: 0.505,
      evPercentage: 4.2,
      kellyPercent: 2.1,
      detectedAt: '2026-03-09T23:00:00Z',
    },
  ],
}

const ARB_RESPONSE: APIResponse<ArbitrageOpportunity[]> = {
  data: [
    {
      eventId: 'evt_123',
      eventName: 'Lakers vs Celtics',
      sport: 'basketball',
      league: 'nba',
      marketType: 'moneyline',
      profitPercent: 1.83,
      impliedTotal: 0.982,
      legs: [
        {
          sportsbook: 'draftkings',
          selection: 'Lakers ML',
          selectionType: 'home',
          odds: { american: -105, decimal: 1.952, probability: 0.512 },
          stakePercent: 51.2,
        },
        {
          sportsbook: 'fanduel',
          selection: 'Celtics ML',
          selectionType: 'away',
          odds: { american: 115, decimal: 2.15, probability: 0.465 },
          stakePercent: 48.8,
        },
      ],
      detectedAt: '2026-03-09T23:00:00Z',
    },
  ],
}

const SPORTS_RESPONSE: APIResponse<Sport[]> = {
  data: [
    { id: 'basketball', name: 'Basketball', slug: 'basketball', active: true, eventCount: 42 },
    { id: 'football', name: 'Football', slug: 'football', active: true, eventCount: 16 },
  ],
}

const ACCOUNT_RESPONSE: APIResponse<AccountInfo> = {
  data: {
    key: { id: 'key_123', tier: 'pro', userId: 'user_123' },
    limits: { requestsPerMinute: 300, maxStreams: 10, oddsDelaySeconds: 0, maxBooks: 15 },
    features: { ev: true, arbitrage: true, middles: true, streaming: true },
    addOns: ['websocket'],
  },
}

// ─── Client construction ────────────────────────────────────────────────────

describe('SharpAPI', () => {
  it('creates client with API key', () => {
    const api = new SharpAPI('sk_test_123')
    expect(api).toBeDefined()
    expect(api.odds).toBeDefined()
    expect(api.ev).toBeDefined()
    expect(api.arbitrage).toBeDefined()
    expect(api.middles).toBeDefined()
    expect(api.sports).toBeDefined()
    expect(api.leagues).toBeDefined()
    expect(api.sportsbooks).toBeDefined()
    expect(api.events).toBeDefined()
    expect(api.account).toBeDefined()
    expect(api.stream).toBeDefined()
  })

  it('creates client with createClient helper', () => {
    const api = createClient('sk_test_123')
    expect(api).toBeInstanceOf(SharpAPI)
  })

  it('accepts custom base URL', () => {
    const api = new SharpAPI('sk_test_123', { baseUrl: 'https://custom.api.io' })
    expect(api).toBeDefined()
  })
})

// ─── Odds resource ──────────────────────────────────────────────────────────

describe('OddsResource', () => {
  it('fetches odds', async () => {
    globalThis.fetch = mockFetch(ODDS_RESPONSE)
    const api = new SharpAPI('sk_test_123')

    const result = await api.odds.get({ league: 'nba' })

    expect(result.data).toHaveLength(1)
    expect(result.data[0].sportsbook).toBe('draftkings')
    expect(result.data[0].odds.american).toBe(-110)
  })

  it('passes query params correctly', async () => {
    globalThis.fetch = mockFetch(ODDS_RESPONSE)
    const api = new SharpAPI('sk_test_123')

    await api.odds.get({ league: ['nba', 'nfl'], live: true, limit: 50 })

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('league=nba%2Cnfl')
    expect(calledUrl).toContain('live=true')
    expect(calledUrl).toContain('limit=50')
  })

  it('sends API key header', async () => {
    globalThis.fetch = mockFetch(ODDS_RESPONSE)
    const api = new SharpAPI('sk_test_MY_KEY')

    await api.odds.get()

    const calledOptions = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect(calledOptions.headers).toHaveProperty('X-API-Key', 'sk_test_MY_KEY')
  })

  it('fetches best odds', async () => {
    globalThis.fetch = mockFetch(ODDS_RESPONSE)
    const api = new SharpAPI('sk_test_123')

    const result = await api.odds.best({ league: 'nba' })

    expect(result.data).toHaveLength(1)
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('/odds/best')
  })

  it('fetches batch odds', async () => {
    globalThis.fetch = mockFetch(ODDS_RESPONSE)
    const api = new SharpAPI('sk_test_123')

    await api.odds.batch(['evt_1', 'evt_2'])

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const calledOptions = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect(calledUrl).toContain('/odds/batch')
    expect(calledOptions.method).toBe('POST')
    expect(JSON.parse(calledOptions.body as string)).toEqual({ event_ids: ['evt_1', 'evt_2'] })
  })
})

// ─── EV resource ────────────────────────────────────────────────────────────

describe('EVResource', () => {
  it('fetches EV opportunities', async () => {
    globalThis.fetch = mockFetch(EV_RESPONSE)
    const api = new SharpAPI('sk_test_123')

    const result = await api.ev.get({ min_ev: 3 })

    expect(result.data).toHaveLength(1)
    expect(result.data[0].evPercentage).toBe(4.2)
    expect(result.data[0].sportsbook).toBe('draftkings')
    expect(result.data[0].sharpBook).toBe('pinnacle')
  })
})

// ─── Arbitrage resource ─────────────────────────────────────────────────────

describe('ArbitrageResource', () => {
  it('fetches arbitrage opportunities', async () => {
    globalThis.fetch = mockFetch(ARB_RESPONSE)
    const api = new SharpAPI('sk_test_123')

    const result = await api.arbitrage.get({ min_profit: 1 })

    expect(result.data).toHaveLength(1)
    expect(result.data[0].profitPercent).toBe(1.83)
    expect(result.data[0].legs).toHaveLength(2)
    expect(result.data[0].legs[0].sportsbook).toBe('draftkings')
  })
})

// ─── Sports resource ────────────────────────────────────────────────────────

describe('SportsResource', () => {
  it('lists sports', async () => {
    globalThis.fetch = mockFetch(SPORTS_RESPONSE)
    const api = new SharpAPI('sk_test_123')

    const result = await api.sports.list()

    expect(result.data).toHaveLength(2)
    expect(result.data[0].id).toBe('basketball')
  })

  it('gets single sport', async () => {
    const single: APIResponse<Sport> = { data: SPORTS_RESPONSE.data[0] }
    globalThis.fetch = mockFetch(single)
    const api = new SharpAPI('sk_test_123')

    const result = await api.sports.get('basketball')

    expect(result.data.id).toBe('basketball')
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('/sports/basketball')
  })
})

// ─── Account resource ───────────────────────────────────────────────────────

describe('AccountResource', () => {
  it('fetches account info', async () => {
    globalThis.fetch = mockFetch(ACCOUNT_RESPONSE)
    const api = new SharpAPI('sk_test_123')

    const result = await api.account.me()

    expect(result.data.key.tier).toBe('pro')
    expect(result.data.features.ev).toBe(true)
    expect(result.data.limits.requestsPerMinute).toBe(300)
  })
})

// ─── Error handling ─────────────────────────────────────────────────────────

describe('Error handling', () => {
  it('throws on 401 with error code', async () => {
    globalThis.fetch = mockFetchError('invalid_api_key', 'Invalid API key', 401)
    const api = new SharpAPI('sk_bad_key')

    await expect(api.odds.get()).rejects.toThrow('Invalid API key')
    try {
      await api.odds.get()
    } catch (err: unknown) {
      expect((err as Error & { code: string }).code).toBe('invalid_api_key')
      expect((err as Error & { status: number }).status).toBe(401)
    }
  })

  it('throws on 429 rate limit', async () => {
    globalThis.fetch = mockFetchError('rate_limited', 'Rate limit exceeded', 429)
    const api = new SharpAPI('sk_test_123')

    await expect(api.odds.get()).rejects.toThrow('Rate limit exceeded')
  })

  it('throws on 403 tier restricted', async () => {
    globalThis.fetch = mockFetchError('tier_restricted', 'Pro tier required', 403)
    const api = new SharpAPI('sk_test_123')

    await expect(api.ev.get()).rejects.toThrow('Pro tier required')
  })

  it('throws on timeout', async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((_, reject) => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        setTimeout(() => reject(err), 10)
      })
    )
    const api = new SharpAPI('sk_test_123', { timeout: 1 })

    await expect(api.odds.get()).rejects.toThrow()
  })
})

// ─── Stream resource ────────────────────────────────────────────────────────

describe('StreamResource', () => {
  it('creates SSE stream with correct URL', () => {
    const api = new SharpAPI('sk_test_123')
    const stream = api.stream.odds({ league: 'nba' })

    expect(stream).toBeDefined()
    expect(stream.connected).toBe(false)
  })

  it('creates opportunities stream', () => {
    const api = new SharpAPI('sk_test_123')
    const stream = api.stream.opportunities({ league: 'nba' })

    expect(stream).toBeDefined()
  })

  it('creates all stream', () => {
    const api = new SharpAPI('sk_test_123')
    const stream = api.stream.all({ league: 'nba' })

    expect(stream).toBeDefined()
  })

  it('creates event stream', () => {
    const api = new SharpAPI('sk_test_123')
    const stream = api.stream.event('evt_123')

    expect(stream).toBeDefined()
  })
})

// ─── StreamManager ──────────────────────────────────────────────────────────

describe('StreamManager', () => {
  it('registers and removes handlers', () => {
    const api = new SharpAPI('sk_test_123')
    const stream = api.stream.odds()
    const handler = vi.fn()

    stream.on('update', handler)
    stream.off('update', handler)

    // No error — handler was registered and removed cleanly
    expect(true).toBe(true)
  })

  it('supports chaining', () => {
    const api = new SharpAPI('sk_test_123')
    const stream = api.stream.odds()

    const result = stream
      .on('initial', vi.fn())
      .on('update', vi.fn())
      .on('error', vi.fn())

    expect(result).toBe(stream)
  })

  it('disconnect is safe when not connected', () => {
    const api = new SharpAPI('sk_test_123')
    const stream = api.stream.odds()

    // Should not throw
    stream.disconnect()
    expect(stream.connected).toBe(false)
  })
})

// ─── WebSocketStreamManager ─────────────────────────────────────────────────

describe('WebSocketStreamManager', () => {
  it('creates WebSocket stream', () => {
    const api = new SharpAPI('sk_test_123')
    const stream = api.stream.oddsWs({ sportsbook: ['draftkings'], league: ['nba'] })

    expect(stream).toBeDefined()
    expect(stream.connected).toBe(false)
  })

  it('supports chaining', () => {
    const api = new SharpAPI('sk_test_123')
    const stream = api.stream.oddsWs()

    const result = stream
      .on('connected', vi.fn())
      .on('initial', vi.fn())
      .on('odds_update', vi.fn())
      .on('error', vi.fn())

    expect(result).toBe(stream)
  })

  it('disconnect is safe when not connected', () => {
    const api = new SharpAPI('sk_test_123')
    const stream = api.stream.oddsWs()

    stream.disconnect()
    expect(stream.connected).toBe(false)
  })
})

// ─── URL construction ───────────────────────────────────────────────────────

describe('URL construction', () => {
  it('uses default base URL', async () => {
    globalThis.fetch = mockFetch(SPORTS_RESPONSE)
    const api = new SharpAPI('sk_test_123')

    await api.sports.list()

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toMatch(/^https:\/\/api\.sharpapi\.io/)
  })

  it('uses custom base URL', async () => {
    globalThis.fetch = mockFetch(SPORTS_RESPONSE)
    const api = new SharpAPI('sk_test_123', { baseUrl: 'https://staging.sharpapi.io' })

    await api.sports.list()

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toMatch(/^https:\/\/staging\.sharpapi\.io/)
  })

  it('omits undefined params', async () => {
    globalThis.fetch = mockFetch(ODDS_RESPONSE)
    const api = new SharpAPI('sk_test_123')

    await api.odds.get({ league: 'nba', live: undefined })

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('league=nba')
    expect(calledUrl).not.toContain('live')
  })
})
