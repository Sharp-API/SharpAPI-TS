export const BOOKS = ['draftkings', 'fanduel']
export const LEAGUES = ['mlb', 'nfl', 'nba', 'nhl']

// The SDK passes through snake_case JSON. Join only mapped canonical events;
// book-native IDs and display names are not safe cross-book join keys.
export function compareOdds(odds, now = Date.now()) {
  const events = new Map()
  // Resolve duplicates before filtering status, otherwise an old open quote
  // could survive a newer suspension from the same book.
  const newest = new Map()
  for (const odd of odds) {
    if (!odd || !Number.isFinite(Date.parse(odd.timestamp))) continue
    const key = JSON.stringify([
      odd.league,
      odd.event_uuid,
      odd.sportsbook,
      odd.market_type,
      odd.market_segment || 'full_game',
      odd.selection_type,
    ])
    const previous = newest.get(key)
    if (
      !previous ||
      Date.parse(odd.timestamp) >= Date.parse(previous.timestamp)
    )
      newest.set(key, odd)
  }
  for (const odd of newest.values()) {
    if (
      !odd ||
      typeof odd.event_uuid !== 'string' ||
      !odd.event_uuid ||
      !BOOKS.includes(odd.sportsbook) ||
      !LEAGUES.includes(odd.league) ||
      odd.market_type !== 'moneyline' ||
      (odd.market_segment && odd.market_segment !== 'full_game') ||
      !['home', 'away'].includes(odd.selection_type) ||
      odd.is_live !== false ||
      odd.is_active === false ||
      ['live', 'ended'].includes(odd.status) ||
      !(Date.parse(odd.event_start_time) > now) ||
      !Number.isFinite(Date.parse(odd.timestamp)) ||
      !Number.isFinite(odd.odds_decimal) ||
      odd.odds_decimal <= 1 ||
      typeof odd.home_team !== 'string' ||
      typeof odd.away_team !== 'string'
    )
      continue
    const id = `${odd.league}:${odd.event_uuid}`
    if (!events.has(id))
      events.set(id, {
        id,
        home: odd.home_team,
        away: odd.away_team,
        league: odd.league,
        startTime: odd.event_start_time,
        selections: new Map(),
      })
    const event = events.get(id)
    const side = odd.selection_type
    if (!event.selections.has(side))
      event.selections.set(side, {
        side,
        label: side === 'home' ? event.home : event.away,
        prices: {},
        best: [],
      })
    const row = event.selections.get(side)
    const previous = row.prices[odd.sportsbook]
    if (previous && Date.parse(previous.timestamp) >= Date.parse(odd.timestamp))
      continue
    const decimal = odd.odds_decimal
    row.prices[odd.sportsbook] = {
      decimal,
      american:
        decimal >= 2
          ? Math.round((decimal - 1) * 100)
          : Math.round(-100 / (decimal - 1)),
      timestamp: odd.timestamp,
    }
  }
  return [...events.values()]
    .map(({ selections, ...event }) => ({
      ...event,
      rows: [...selections.values()]
        .sort((a, b) => a.side.localeCompare(b.side))
        .map((row) => {
          if (BOOKS.every((book) => row.prices[book])) {
            const best = Math.max(
              ...BOOKS.map((book) => row.prices[book].decimal),
            )
            row.best = BOOKS.filter((book) => row.prices[book].decimal === best)
          }
          return row
        }),
    }))
    .sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id),
    )
}
