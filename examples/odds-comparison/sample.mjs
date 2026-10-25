// Synthetic fixtures, generated relative to now so sample mode remains useful.
// These are illustrative matchups and prices, not a real schedule or feed.
export function sampleOdds(league, now = Date.now()) {
  const teams = {
    mlb: [
      ['Chicago Cubs', 'New York Mets'],
      ['Seattle Mariners', 'Boston Red Sox'],
      ['Los Angeles Dodgers', 'San Diego Padres'],
    ],
    nfl: [
      ['Buffalo Bills', 'Kansas City Chiefs'],
      ['Philadelphia Eagles', 'Dallas Cowboys'],
      ['Detroit Lions', 'Green Bay Packers'],
    ],
    nba: [
      ['Boston Celtics', 'New York Knicks'],
      ['Denver Nuggets', 'Los Angeles Lakers'],
      ['Oklahoma City Thunder', 'Dallas Mavericks'],
    ],
    nhl: [
      ['Boston Bruins', 'New York Rangers'],
      ['Edmonton Oilers', 'Vancouver Canucks'],
      ['Colorado Avalanche', 'Dallas Stars'],
    ],
  }
  return teams[league].flatMap(([away, home], i) =>
    ['away', 'home'].flatMap((side, j) =>
      ['draftkings', 'fanduel'].flatMap((sportsbook, k) => {
        if (i === 2 && j === 1 && k === 1) return []
        const decimal =
          [
            [2.15, 1.77],
            [1.91, 1.91],
            [2.35, 1.62],
          ][i][j] + (i === 1 ? 0 : k * (j === 0 ? 0.07 : -0.02))
        return [
          {
            event_uuid: `sample-${league}-${i}`,
            event_id: `${sportsbook}-${i}`,
            league,
            home_team: home,
            away_team: away,
            sportsbook,
            market_type: 'moneyline',
            market_segment: 'full_game',
            selection_type: side,
            selection: side === 'home' ? home : away,
            odds_decimal: Number(decimal.toFixed(2)),
            is_live: false,
            is_active: true,
            event_start_time: new Date(now + (i + 2) * 3600000).toISOString(),
            timestamp: new Date(now - 60000 - k * 1000).toISOString(),
          },
        ]
      }),
    ),
  )
}
