import test from 'node:test'
import { get } from 'node:http'
import assert from 'node:assert/strict'
import { compareOdds } from './comparison.mjs'
import { createDemoServer } from './server.mjs'

const now = Date.parse('2026-09-08T12:00:00Z')
const odd = (overrides = {}) => ({
  event_uuid: 'event-1',
  event_id: 'book-event-1',
  sportsbook: 'draftkings',
  league: 'mlb',
  home_team: 'Home',
  away_team: 'Away',
  market_type: 'moneyline',
  market_segment: 'full_game',
  selection_type: 'home',
  selection: 'Home',
  odds_decimal: 2.1,
  odds_american: 110,
  event_start_time: '2026-09-08T20:00:00Z',
  timestamp: '2026-09-08T11:59:00Z',
  is_live: false,
  ...overrides,
})

test('matches canonical event and side; compares decimal prices and preserves missing sides', () => {
  const events = compareOdds(
    [
      odd(),
      odd({ sportsbook: 'fanduel', odds_decimal: 2.2, odds_american: 120 }),
      odd({
        selection_type: 'away',
        selection: 'Away',
        odds_decimal: 1.8,
        odds_american: -125,
      }),
    ],
    now,
  )
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].rows.find((r) => r.side === 'home').best, [
    'fanduel',
  ])
  assert.deepEqual(events[0].rows.find((r) => r.side === 'away').best, [])
})
test('does not compare periods, three-way markets, suspended, live, started or malformed odds', () => {
  const bad = [
    { market_type: 'moneyline_3-way' },
    { market_segment: '1st_half' },
    { is_active: false },
    { is_live: true },
    { event_start_time: '2026-09-08T11:00:00Z' },
    { odds_decimal: 0 },
    { event_uuid: '' },
    { timestamp: 'invalid' },
    { selection_type: 'draw' },
    { sportsbook: 'other' },
  ]
  assert.deepEqual(
    compareOdds(
      bad.map((o) => odd(o)),
      now,
    ),
    [],
  )
})
test('uses newest duplicate rather than best historic price; separates event IDs', () => {
  const events = compareOdds(
    [
      odd({ odds_decimal: 4 }),
      odd({ odds_decimal: 2, timestamp: '2026-09-08T12:00:00Z' }),
      odd({ event_uuid: 'event-2' }),
    ],
    now,
  )
  assert.equal(events.length, 2)
  assert.equal(events[0].rows[0].prices.draftkings.decimal, 2)
})
test('ties mark both books', () =>
  assert.deepEqual(
    compareOdds([odd(), odd({ sportsbook: 'fanduel' })], now)[0].rows[0].best,
    ['draftkings', 'fanduel'],
  ))

async function withServer(options, run) {
  const server = createDemoServer(options)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    await run(url)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}
test('sample mode needs no API and remains explicit', () =>
  withServer({ sample: true }, async (url) => {
    const response = await fetch(`${url}/api/odds?league=mlb`)
    const body = await response.json()
    assert.equal(body.mode, 'sample')
    assert.ok(body.events.length > 0)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }))
test('bounds queries to free-tier books and caches/coalesces refreshes', async () => {
  const calls = []
  await withServer(
    {
      client: {
        odds: {
          get: async (params) => {
            calls.push(params)
            return {
              data: [odd({ sportsbook: params.sportsbook })],
              pagination: { has_more: true },
            }
          },
        },
      },
    },
    async (url) => {
      const responses = await Promise.all([
        fetch(`${url}/api/odds?league=mlb`),
        fetch(`${url}/api/odds?league=mlb`),
      ])
      assert.equal((await responses[0].json()).partial, true)
      await fetch(`${url}/api/odds?league=mlb`)
      assert.equal(calls.length, 2)
      assert.deepEqual(
        calls.map((p) => p.sportsbook),
        ['draftkings', 'fanduel'],
      )
      assert.ok(
        calls.every(
          (p) =>
            p.live === false && p.market === 'moneyline' && p.limit === 200,
        ),
      )
    },
  )
})
test('rejects invalid routes, methods, origins and leagues without upstream requests', () =>
  withServer({ sample: true }, async (url) => {
    assert.equal((await fetch(`${url}/api/odds?league=bad`)).status, 400)
    assert.equal((await fetch(`${url}/.env`)).status, 404)
    assert.equal(
      (await fetch(`${url}/api/odds`, { method: 'POST' })).status,
      405,
    )
    assert.equal(
      (
        await fetch(`${url}/api/odds`, {
          headers: { Origin: 'https://evil.example' },
        })
      ).status,
      403,
    )
    assert.equal(
      await new Promise((resolve) =>
        get(
          `${url}/api/odds`,
          { headers: { Host: 'evil.example' } },
          (response) => {
            response.resume()
            resolve(response.statusCode)
          },
        ),
      ),
      403,
    )
  }))
test('sanitizes upstream failures and never substitutes sample data', () =>
  withServer(
    {
      client: {
        odds: {
          get: async () => {
            throw Object.assign(new Error('secret-key-value'), { status: 401 })
          },
        },
      },
    },
    async (url) => {
      const response = await fetch(`${url}/api/odds?league=mlb`)
      assert.equal(response.status, 502)
      const body = await response.text()
      assert.ok(!body.includes('secret-key-value'))
      assert.match(body, /API key/)
    },
  ))

test('joins canonical UUID across native IDs, never identical names with different UUIDs', () => {
  const rows = [
    odd({ event_id: 'dk-123' }),
    odd({ event_id: 'fd-456', sportsbook: 'fanduel' }),
    odd({ event_uuid: 'other', sportsbook: 'fanduel' }),
  ]
  const events = compareOdds(rows, now)
  assert.equal(events.length, 2)
  assert.equal(Object.keys(events[0].rows[0].prices).length, 2)
})
test('backs off on failures without leaking keys or calling repeatedly', async () => {
  let calls = 0
  await withServer(
    {
      client: {
        odds: {
          get: async () => {
            calls++
            throw new Error('sensitive')
          },
        },
      },
    },
    async (url) => {
      await fetch(`${url}/api/odds`)
      await fetch(`${url}/api/odds`)
      assert.equal(calls, 2)
    },
  )
})

test('a newer suspended quote removes an older open quote', () => {
  assert.deepEqual(
    compareOdds(
      [odd(), odd({ is_active: false, timestamp: '2026-09-08T12:00:00Z' })],
      now,
    ),
    [],
  )
})
