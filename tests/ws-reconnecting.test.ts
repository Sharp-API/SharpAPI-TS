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
