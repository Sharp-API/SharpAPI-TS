// Event lifecycle values, pinned against what the API sends.
//
// The API serves four event states: `upcoming` and `live` on the list,
// `final` for a completed event, and `unconfirmed` (by-id only) for a game the
// live feed dropped before an end-of-game frame. `Event.status` used to declare
// `upcoming | live | ended`: `ended` is never sent, and a consumer switching
// on the declared values had no branch for the two the API does send.
//
// Types are erased at runtime, so the union itself is checked twice: by
// `tsc -p tsconfig.test.json` (the `@ts-expect-error` below), and by reading
// the declaration out of the source, the way the wire-contract ratchet does.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { type EventStatus, SharpAPI } from '../src/index'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(join(HERE, '..', 'src', 'index.ts'), 'utf8')

// A by-id response for an `unconfirmed` event, as a key with the Game State
// add-on receives it: no `completed_at`, no result, a `last_seen` block.
const UNCONFIRMED = {
  data: {
    id: 'basketball_nba_2026-10-16_bos_nyk',
    sport: 'basketball',
    league: 'nba',
    home_team: 'New York Knicks',
    away_team: 'Boston Celtics',
    start_time: '2026-10-16T23:30:00Z',
    status: 'unconfirmed',
    is_live: false,
    result_access: 'granted',
    last_seen: {
      home_score: 97,
      away_score: 81,
      score_type: 'points',
      game_period: 'Q4',
      game_clock: '4:59',
      seen_at: '2026-10-17T01:52:10Z',
    },
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('Event.status', () => {
  it('declares exactly the four states the API sends', () => {
    const m = /export type EventStatus =([^\n]+)/.exec(SOURCE)
    expect(m).not.toBeNull()
    const declared = [...(m?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()
    expect(declared).toEqual(['final', 'live', 'unconfirmed', 'upcoming'])
  })

  it('Event declares last_seen and types status as EventStatus', () => {
    const m = /export interface Event\b[^{]*\{([\s\S]*?)\n\}/.exec(SOURCE)
    expect(m).not.toBeNull()
    const body = (m?.[1] ?? '').replace(/\/\*\*[\s\S]*?\*\//g, '')
    expect(body).toMatch(/^\s*status: EventStatus$/m)
    expect(body).toMatch(/^\s*last_seen\?: EventLastSeen$/m)
  })

  it('compiles against the four states and refuses `ended`', () => {
    const states: EventStatus[] = ['upcoming', 'live', 'final', 'unconfirmed']
    // @ts-expect-error — the API never sends `ended`.
    const ended: EventStatus = 'ended'
    expect(states).toHaveLength(4)
    expect(ended).toBe('ended')
  })

  it('events.get() hands an unconfirmed event and its last_seen back unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(UNCONFIRMED), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    const client = new SharpAPI('sk_test')
    const res = await client.events.get(UNCONFIRMED.data.id)
    expect(res.data.status).toBe('unconfirmed')
    expect(res.data.last_seen).toEqual(UNCONFIRMED.data.last_seen)
  })
})
