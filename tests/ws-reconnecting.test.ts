import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketStreamManager, type WebSocketMessage } from '../src/index'

// A stand-in for the runtime's WebSocket: records every instance the stream
// opens, so a test can close one with a chosen code and see whether the stream
// opens another.
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {}
  open(): void {
    this.readyState = 1
    this.onopen?.()
  }
  closeWith(code: number, reason: string): void {
    this.readyState = 3
    this.onclose?.({ code, reason })
  }
  // A connection attempt the server refuses: the runtime fires error, then an
  // abnormal close, without ever opening.
  refuse(): void {
    this.onerror?.()
    this.closeWith(1006, '')
  }
}

const URL = 'wss://ws.example.test/ws'

function streamWithLog() {
  const seen: { type: string; message: WebSocketMessage }[] = []
  const stream = new WebSocketStreamManager(URL)
  for (const type of ['reconnecting', 'error'] as const) {
    stream.on(type, (message) => seen.push({ type, message }))
  }
  return { stream, seen }
}

describe('WebSocket close 1012 (server updating)', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('emits reconnecting, not error, and reconnects', () => {
    const { stream, seen } = streamWithLog()
    stream.connect()
    FakeWebSocket.instances[0].open()

    FakeWebSocket.instances[0].closeWith(1012, 'server updating')

    expect(seen).toEqual([
      {
        type: 'reconnecting',
        message: {
          type: 'reconnecting',
          code: 1012,
          message: 'server updating',
        },
      },
    ])
    // The first reconnect waits the base delay (1 s), as for any retriable close.
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(FakeWebSocket.instances[1].url).toBe(URL)
    stream.disconnect()
  })

  it('says "Server updating" when the close carries no reason', () => {
    const { stream, seen } = streamWithLog()
    stream.connect()
    FakeWebSocket.instances[0].closeWith(1012, '')
    expect(seen.map((s) => s.message.message)).toEqual(['Server updating'])
    stream.disconnect()
  })

  it('still emits error, and still reconnects, for any other abnormal close', () => {
    const { stream, seen } = streamWithLog()
    stream.connect()
    FakeWebSocket.instances[0].open()

    FakeWebSocket.instances[0].closeWith(1006, '')

    expect(seen).toEqual([
      {
        type: 'error',
        message: { type: 'error', code: 'disconnected', message: 'Connection closed' },
      },
    ])
    vi.advanceTimersByTime(1000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    stream.disconnect()
  })

  it('keeps refusing to reconnect after an auth close', () => {
    const { stream, seen } = streamWithLog()
    stream.connect()
    FakeWebSocket.instances[0].closeWith(4001, 'unauthorized')

    expect(seen.map((s) => [s.type, s.message.code])).toEqual([['error', 'ws_4001']])
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    stream.disconnect()
  })
})

describe('WebSocket retries after a 1012 (server updating)', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]

  it('keeps retrying past 5 attempts while the server is still updating, without error', () => {
    const { stream, seen } = streamWithLog()
    stream.connect()
    latest().open()
    latest().closeWith(1012, 'server updating')

    // Ten refused attempts in a row: today's limit of 5 would have given up.
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(30_000)
      latest().refuse()
    }
    vi.advanceTimersByTime(30_000)

    expect(FakeWebSocket.instances).toHaveLength(12)
    expect(seen.filter((s) => s.type === 'error')).toEqual([])
    expect(seen.every((s) => s.type === 'reconnecting')).toBe(true)
    expect(seen).toHaveLength(11)
    stream.disconnect()
  })

  it('caps the wait between attempts at 30 s', () => {
    const { stream } = streamWithLog()
    stream.connect()
    latest().open()
    latest().closeWith(1012, '')

    // Waits 1, 2, 4, 8 and 16 s for the first five attempts, then 30 s.
    for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000]) {
      vi.advanceTimersByTime(wait)
      latest().refuse()
    }
    const before = FakeWebSocket.instances.length
    vi.advanceTimersByTime(29_999)
    expect(FakeWebSocket.instances).toHaveLength(before)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(before + 1)
    stream.disconnect()
  })

  it('returns to the normal limit once it has reconnected', () => {
    const { stream, seen } = streamWithLog()
    stream.connect()
    latest().open()
    latest().closeWith(1012, '')
    vi.advanceTimersByTime(1_000)
    latest().open()

    // A later ordinary drop gets today's 5 attempts, then max_retries.
    latest().closeWith(1006, '')
    for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000]) {
      vi.advanceTimersByTime(wait)
      latest().refuse()
    }
    vi.advanceTimersByTime(60_000)

    expect(seen.map((s) => s.message.code).slice(-1)).toEqual(['max_retries'])
    expect(FakeWebSocket.instances).toHaveLength(7)
    stream.disconnect()
  })

  it('still gives up after 5 attempts on an ordinary drop', () => {
    const { stream, seen } = streamWithLog()
    stream.connect()
    latest().open()
    latest().closeWith(1006, '')
    for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000]) {
      vi.advanceTimersByTime(wait)
      latest().refuse()
    }
    vi.advanceTimersByTime(60_000)

    expect(FakeWebSocket.instances).toHaveLength(6)
    expect(seen.map((s) => s.message.code).slice(-1)).toEqual(['max_retries'])
    stream.disconnect()
  })

  it('stops on an auth close during the update window', () => {
    const { stream, seen } = streamWithLog()
    stream.connect()
    latest().open()
    latest().closeWith(1012, '')
    vi.advanceTimersByTime(1_000)
    latest().open()
    latest().closeWith(4001, 'unauthorized')
    vi.advanceTimersByTime(120_000)

    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(seen.map((s) => [s.type, s.message.code])).toEqual([
      ['reconnecting', 1012],
      ['error', 'ws_4001'],
    ])
    stream.disconnect()
  })
})
