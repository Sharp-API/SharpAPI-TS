'use strict'

const byId = (id) => document.getElementById(id)
const board = byId('comparison')
const league = byId('league')
const refresh = byId('refresh')
let currentData = null
let oddsFormat = 'american'
let requestNumber = 0
let controller

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function dateLabel(value, options) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, options).format(date)
}

function showState(kind, title, description) {
  const state = el('div', `state ${kind}`)
  const marker = el(
    'span',
    kind === 'loading' ? 'loader' : 'state-marker',
    kind === 'error' ? '!' : kind === 'empty' ? '—' : undefined,
  )
  marker.setAttribute('aria-hidden', 'true')
  state.append(marker, el('h2', '', title), el('p', '', description))
  board.replaceChildren(state)
}

function priceCell(row, book) {
  const cell = el('td')
  const price = row.prices[book]
  if (!price) {
    const missing = el('span', 'price-value missing', '—')
    missing.setAttribute('aria-label', 'No price available')
    cell.append(missing)
    return cell
  }
  const comparable = Boolean(row.prices.draftkings && row.prices.fanduel)
  const best = comparable && row.best.includes(book)
  const tied = best && row.best.length === 2
  const holder = el('div', `price${best ? ' winner' : ''}`)
  const value =
    oddsFormat === 'decimal'
      ? Number(price.decimal).toFixed(2)
      : `${Number(price.american) > 0 ? '+' : ''}${price.american}`
  holder.append(el('span', 'price-value', value))
  if (best)
    holder.append(
      el('span', 'price-tag', tied ? 'Best price · tie' : 'Best price'),
    )
  holder.title = price.timestamp
    ? `Feed updated: ${dateLabel(price.timestamp, { dateStyle: 'medium', timeStyle: 'long' })}`
    : 'Feed update time unavailable'
  holder.setAttribute(
    'aria-label',
    `${value}${best ? (tied ? ', best price, tied' : ', best price') : ''}. ${holder.title}`,
  )
  cell.append(holder)
  return cell
}

function renderEvents() {
  if (!currentData) return
  if (!currentData.events.length) {
    showState(
      'empty',
      'No matchups to compare',
      'No eligible pre-match moneyline markets were returned for this league. Try another league or refresh later.',
    )
    return
  }
  const fragment = document.createDocumentFragment()
  for (const event of currentData.events) {
    const article = el('article', 'event')
    const heading = el('div', 'event-heading')
    const title = el('h2')
    title.append(
      el('span', '', event.away),
      el('span', 'versus', 'at'),
      el('span', '', event.home),
    )
    const metadata = el('div', 'event-meta')
    const startTime = el(
      'time',
      '',
      dateLabel(event.startTime, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }),
    )
    if (!Number.isNaN(new Date(event.startTime).getTime()))
      startTime.dateTime = new Date(event.startTime).toISOString()
    metadata.append(
      el('span', 'league-pill', String(event.league).toUpperCase()),
      startTime,
    )
    heading.append(title, metadata)
    const table = el('table')
    const caption = el(
      'caption',
      'sr-only',
      `${event.away} at ${event.home}, moneyline odds`,
    )
    const head = el('thead')
    const headerRow = el('tr')
    const selection = el('th', '', 'SELECTION')
    selection.scope = 'col'
    headerRow.append(selection)
    for (const [book, name, initials] of [
      ['draftkings', 'DraftKings', 'DK'],
      ['fanduel', 'FanDuel', 'FD'],
    ]) {
      const th = el('th')
      th.scope = 'col'
      const label = el('span', 'book-name')
      const icon = el('span', `book-icon ${book}`, initials)
      icon.setAttribute('aria-hidden', 'true')
      label.append(icon, el('span', '', name))
      th.append(label)
      headerRow.append(th)
    }
    head.append(headerRow)
    const body = el('tbody')
    for (const row of event.rows) {
      const tr = el('tr')
      const label = el('td')
      label.append(
        el('span', 'selection-name', row.label),
        el('span', 'selection-side', row.side),
      )
      tr.append(label, priceCell(row, 'draftkings'), priceCell(row, 'fanduel'))
      body.append(tr)
    }
    table.append(caption, head, body)
    article.append(heading, table)
    fragment.append(article)
  }
  board.replaceChildren(fragment)
}

function renderData(data) {
  const sample = data.mode === 'sample'
  byId('mode-label').textContent = sample ? 'SAMPLE DATA' : 'API CONNECTED'
  byId('mode-description').textContent = sample
    ? 'Synthetic matchups & prices. Add your API key to fetch real markets.'
    : 'Pre-match odds · Free tier: 60s delay · Refreshes use a 30s server cache.'
  byId('mode-tag').textContent = sample ? 'NO KEY REQUIRED' : 'PRE-MATCH ODDS'
  byId('event-count').textContent = String(data.events.length)
  byId('fetched-time').textContent =
    `Fetched ${dateLabel(data.fetchedAt, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`
  byId('fetched-time').title = dateLabel(data.fetchedAt, {
    dateStyle: 'medium',
    timeStyle: 'long',
  })
  byId('coverage').hidden = !data.partial
  byId('data-disclaimer').textContent = sample
    ? 'Sample mode uses synthetic fixtures and prices, not real games. No betting recommendations.'
    : 'Prices may change. Coverage is limited to returned markets. No betting recommendations.'
  renderEvents()
  byId('announcement').textContent =
    `${data.events.length} ${league.value.toUpperCase()} matchups loaded. ${sample ? 'Sample data.' : 'API data.'}${data.partial ? ' Partial coverage.' : ''}`
}

async function loadOdds() {
  controller?.abort()
  controller = new AbortController()
  const thisRequest = ++requestNumber
  currentData = null
  refresh.disabled = true
  byId('refresh-label').textContent = 'Fetching…'
  byId('coverage').hidden = true
  byId('event-count').textContent = '—'
  byId('fetched-time').textContent = 'Fetching odds…'
  byId('fetched-time').removeAttribute('title')
  board.setAttribute('aria-busy', 'true')
  showState(
    'loading',
    'Getting the board ready',
    'Fetching and matching prices from both sportsbooks.',
  )
  try {
    const response = await fetch(
      `/api/odds?league=${encodeURIComponent(league.value)}`,
      { signal: controller.signal },
    )
    const data = await response.json()
    if (!response.ok)
      throw new Error(
        data.error ||
          'Could not fetch odds. Check the server configuration and try again.',
      )
    if (thisRequest !== requestNumber) return
    currentData = data
    renderData(data)
  } catch (error) {
    if (thisRequest !== requestNumber || error.name === 'AbortError') return
    const message =
      error instanceof TypeError || error instanceof SyntaxError
        ? 'The demo server could not be reached. Check that it is running, then refresh.'
        : error.message
    byId('event-count').textContent = '—'
    byId('fetched-time').textContent = 'Fetch unsuccessful'
    byId('mode-label').textContent = 'CONNECTION ERROR'
    byId('mode-description').textContent =
      'The request failed. See the message below, then try refreshing.'
    byId('mode-tag').textContent = 'NO DATA DISPLAYED'
    showState('error', 'Unable to load odds', message)
    byId('announcement').textContent = `Unable to load odds. ${message}`
  } finally {
    if (thisRequest === requestNumber) {
      refresh.disabled = false
      byId('refresh-label').textContent = 'Refresh odds'
      board.setAttribute('aria-busy', 'false')
    }
  }
}

league.addEventListener('change', loadOdds)
refresh.addEventListener('click', loadOdds)
for (const radio of document.querySelectorAll('input[name="format"]')) {
  radio.addEventListener('change', () => {
    oddsFormat = radio.value
    renderEvents()
    byId('announcement').textContent = `Odds displayed in ${oddsFormat} format.`
  })
}
loadOdds()
