// Low-hold team-total keys: is_team_total, team_name and team_side, against a
// real response captured from the deployed API on 2026-11-16. Row 0 is a
// team-total row; row 1 is a moneyline row.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { LowHoldOpportunity } from '../src/index'

const HERE = dirname(fileURLToPath(import.meta.url))
const rows: LowHoldOpportunity[] = JSON.parse(
  readFileSync(join(HERE, 'fixtures', 'low-hold.json'), 'utf8'),
).data

describe('LowHoldOpportunity team-total keys', () => {
  it('types the three keys (tsc -p tsconfig.test.json fails if they fall back to unknown)', () => {
    const [team, other] = rows
    const isTeamTotal: boolean | undefined = team.is_team_total
    const teamName: string | null | undefined = team.team_name
    const teamSide: 'home' | 'away' | undefined = team.team_side
    expect({ isTeamTotal, teamName, teamSide }).toEqual({
      isTeamTotal: true,
      teamName: 'Cincinnati Bearcats',
      teamSide: 'home',
    })
    expect(teamName).toBe(teamSide === 'home' ? team.home_team : team.away_team)
    const otherSide: 'home' | 'away' | undefined = other.team_side
    expect({ tt: other.is_team_total, name: other.team_name, side: otherSide }).toEqual({
      tt: false,
      name: null,
      side: undefined,
    })
  })
})
