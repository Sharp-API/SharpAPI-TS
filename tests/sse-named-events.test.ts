import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharpAPI, type StreamEventType, StreamManager } from '../src/index'

// A stand-in for the runtime's EventSource that dispatches the way the real one
// does: a named event (`event: odds:update`) reaches only the listeners added
// for that name, and the `on<name>` attribute handler exists only for `open`,
// `message` and `error`. So `onmessage` never sees a named event, and `onerror`
// sees both a server `event: error` frame (with data) and a dropped connection
// (a plain Event, no data).
class FakeEventSource {
  static instances: FakeEventSource[] = []
  readyState = 0
  closed = false
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  private listeners = new Map<string, Array<(event: Event) => void>>()
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, listener: (event: Event) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }
  close(): void {
    this.closed = true
    this.readyState = 2
  }
  private dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
    if (type === 'message') this.onmessage?.(event as MessageEvent)
    if (type === 'error') this.onerror?.(event)
    if (type === 'open') this.onopen?.(event)
  }
  // One SSE frame from the server: `event: <name>` then `data: <payload>`.
  frame(name: string, payload: unknown): void {
    const event = Object.assign(new Event(name), {
      data: JSON.stringify(payload),
    })
    this.dispatch(name, event)
  }
  dropConnection(): void {
    this.dispatch('error', new Event('error'))
  }
}

// The named events the stream reference in the API docs lists, except `error`
// and `displaced`, which have their own tests below.
const DOCUMENTED_EVENTS = [
  'connected',
  'snapshot',
  'snapshot:complete',
  'odds:update',
  'odds:locked',
  'odds:removed',
  'book:status',
  'ev:detected',
  'ev:expired',
  'arb:detected',
  'arb:expired',
  'middles:detected',
  'middles:expired',
  'low_hold:detected',
  'low_hold:expired',
  'gamestate:snapshot',
  'gamestate:update',
  'gamestate:final',
  'filter_warning',
  'resync_required',
  'heartbeat',
] as const satisfies readonly StreamEventType[]

// The query string of the EventSource the stream opened last.
function lastQuery(): URLSearchParams {
  const source = FakeEventSource.instances[FakeEventSource.instances.length - 1]
  if (!source) throw new Error('the stream opened no EventSource')
  return new URL(source.url).searchParams
}

describe('SSE stream', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', FakeEventSource)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('asks the server for the channel and event by the names it reads', () => {
    const api = new SharpAPI('sk_test')
    const cases: Array<[StreamManager, string, string | null]> = [
      [api.stream.odds({ sportsbook: 'pinnacle' }), 'odds', null],
      [api.stream.opportunities(), 'opportunities', null],
      [api.stream.all(), 'all', null],
      [api.stream.event('nba_a_b_2026-11-16'), 'odds', 'nba_a_b_2026-11-16'],
      [api.stream.odds({ eventId: 'evt_1' }), 'odds', 'evt_1'],
    ]
    for (const [stream, channel, eventId] of cases) {
      stream.connect()
      const q = lastQuery()
      expect(q.get('channel')).toBe(channel)
      expect(q.get('event_id')).toBe(eventId)
      expect(q.has('type')).toBe(false)
      expect(q.has('eventId')).toBe(false)
      expect(q.get('api_key')).toBe('sk_test')
      stream.disconnect()
    }
    // Other filters still go through.
    api.stream.odds({ sportsbook: 'pinnacle' }).connect()
    expect(lastQuery().get('sportsbook')).toBe('pinnacle')
  })

  it('hands every documented named event to the handlers for that name', () => {
    const stream = new StreamManager('https://api.example.test/api/v1/stream')
    stream.connect()
    const source = FakeEventSource.instances[0]
    // Handlers added after connect() must still be reached.
    const seen: Array<[string, unknown]> = []
    for (const name of DOCUMENTED_EVENTS) {
      stream.on(name, (event) => seen.push([event.type, event.data]))
    }
    for (const name of DOCUMENTED_EVENTS) source.frame(name, { marker: name })
    expect(seen).toEqual(
      DOCUMENTED_EVENTS.map((name) => [name, { marker: name }]),
    )
  })

  it('passes an odds:update envelope through as sent, for merging by id', () => {
    const stream = new StreamManager('https://api.example.test/api/v1/stream')
    const updates: unknown[] = []
    const stamps: string[] = []
    stream.on('odds:update', ({ data }) => updates.push(data))
    stream.on('heartbeat', ({ timestamp }) => stamps.push(timestamp))
    stream.connect()
    const source = FakeEventSource.instances[0]
    const delta = {
      odds: [
        { id: '123456', odds_american: -150, odds_decimal: 1.667, line: null },
      ],
      count: 1,
      book: 'draftkings',
      partial: false,
    }
    source.frame('odds:update', delta)
    source.frame('heartbeat', { timestamp: '2026-01-26T02:11:07.846Z', seq: 1 })
    expect(updates).toEqual([delta])
    expect(stamps).toEqual(['2026-01-26T02:11:07.846Z'])
  })

  it('reports an error frame from the server without reconnecting', () => {
    const stream = new StreamManager('https://api.example.test/api/v1/stream')
    const errors: unknown[] = []
    stream.on('error', ({ data }) => errors.push(data))
    stream.connect()
    const source = FakeEventSource.instances[0]
    source.frame('error', { code: 'upstream_error', message: 'Will retry.' })
    vi.advanceTimersByTime(60_000)
    expect(errors).toEqual([{ code: 'upstream_error', message: 'Will retry.' }])
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(source.closed).toBe(false)
  })

  it('reports a dropped connection as an error and reconnects', () => {
    const stream = new StreamManager('https://api.example.test/api/v1/stream')
    const errors: unknown[] = []
    stream.on('error', ({ data }) => errors.push(data))
    stream.connect()
    FakeEventSource.instances[0].dropConnection()
    vi.advanceTimersByTime(1000)
    expect(errors).toEqual([{ message: 'Connection error' }])
    expect(FakeEventSource.instances).toHaveLength(2)
  })

  it('stops for good when displaced with reconnect: false', () => {
    const stream = new StreamManager('https://api.example.test/api/v1/stream')
    const displaced: unknown[] = []
    stream.on('displaced', ({ data }) => displaced.push(data))
    stream.connect()
    const source = FakeEventSource.instances[0]
    const frame = {
      code: 'too_many_streams',
      message: 'Displaced.',
      reconnect: false,
    }
    source.frame('displaced', frame)
    vi.advanceTimersByTime(60_000)
    expect(displaced).toEqual([frame])
    expect(source.closed).toBe(true)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(stream.connected).toBe(false)
  })

  it('types each handler by the event it listens to', () => {
    const stream = new StreamManager('https://api.example.test/api/v1/stream')
    stream.on('odds:update', ({ data }) => data.odds.map((row) => row.id))
    stream.on('odds:removed', ({ data }) => data.ids.length)
    stream.on('snapshot:complete', ({ data }) => data.mode)
    // The pre-0.6.0 names were never sent by the server.
    // @ts-expect-error 'update' is not a stream event
    stream.on('update', () => {})
    // @ts-expect-error 'initial' is not a stream event
    stream.on('initial', () => {})
    expect(stream).toBeInstanceOf(StreamManager)
  })
})
