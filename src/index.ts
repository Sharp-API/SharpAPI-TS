/**
 * SharpAPI TypeScript SDK
 *
 * Official TypeScript/JavaScript client for the SharpAPI real-time sports odds API.
 *
 * @example
 * ```typescript
 * import { SharpAPI } from '@sharpapi/client'
 *
 * const api = new SharpAPI('sk_xxx')
 *
 * // REST API
 * const odds = await api.odds.get({ league: 'NBA' })
 * const arbitrage = await api.arbitrage.get()
 * const ev = await api.ev.get({ min_ev: 3 })
 *
 * // SSE Streaming (requires WebSocket add-on)
 * const stream = api.stream.odds({ league: 'NBA' })
 * stream.on('update', (data) => console.log(data))
 * stream.connect()
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Configuration
// =============================================================================

export interface SharpAPIConfig {
  /** API key (sk_xxx format) */
  apiKey: string
  /** Base URL (default: https://api.sharpapi.io) */
  baseUrl?: string
  /** Request timeout in ms (default: 30000) */
  timeout?: number
}

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.sharpapi.io',
  timeout: 30000,
}

// =============================================================================
// API Response Types
// =============================================================================

/** Standard API response wrapper */
export interface APIResponse<T> {
  data: T
  meta?: {
    count?: number
    total?: number
    pagination?: {
      limit: number
      offset: number
      has_more: boolean
    }
    updated?: string
  }
}

/** Standard API error response */
export interface APIError {
  error: {
    code: string
    message: string
    retry_after?: number
  }
}

/** Odds value in multiple formats */
export interface OddsValue {
  american: number
  decimal: number
  probability: number
}

/** Normalized odds from any sportsbook */
export interface NormalizedOdds {
  id: string
  sportsbook: string
  eventId: string
  sport: string
  league: string
  homeTeam: string
  awayTeam: string
  marketType: string
  selection: string
  selectionType:
    | 'home'
    | 'away'
    | 'over'
    | 'under'
    | 'draw'
    | 'home_draw'
    | 'away_draw'
    | 'home_away'
  odds: OddsValue
  line?: number
  eventStartTime: string
  timestamp: string
  isLive: boolean
  status: 'upcoming' | 'live' | 'ended'
}

/** +EV (Expected Value) opportunity */
export interface EVOpportunity {
  eventId: string
  eventName: string
  sport: string
  league: string
  marketType: string
  selection: string
  sportsbook: string
  odds: OddsValue
  sharpOdds: OddsValue
  sharpBook: string
  fairProbability: number
  evPercentage: number
  kellyPercent: number
  detectedAt: string
}

/** Arbitrage opportunity leg */
export interface ArbitrageLeg {
  sportsbook: string
  selection: string
  selectionType: string
  odds: OddsValue
  stakePercent: number
}

/** Arbitrage opportunity */
export interface ArbitrageOpportunity {
  eventId: string
  eventName: string
  sport: string
  league: string
  marketType: string
  profitPercent: number
  impliedTotal: number
  legs: ArbitrageLeg[]
  detectedAt: string
}

/** Middle opportunity */
export interface MiddleOpportunity {
  id: string
  event_id: string
  event_name: string
  sport: string
  league: string
  market_type: string
  home_team: string
  away_team: string
  side1: {
    book: string
    selection: string
    line: number
    odds: { american: number; decimal: number; probability: number }
    stake_percent: number
  }
  side2: {
    book: string
    selection: string
    line: number
    odds: { american: number; decimal: number; probability: number }
    stake_percent: number
  }
  middle_size: number
  middle_numbers: number[]
  middle_probability: number
  expected_value: number
  quality_score: number
  is_live: boolean
  detected_at: string
}

/** Sport info */
export interface Sport {
  id: string
  name: string
  slug: string
  active: boolean
  eventCount?: number
}

/** League info */
export interface League {
  id: string
  name: string
  slug: string
  sportId: string
  country?: string
  active: boolean
}

/** Sportsbook info */
export interface Sportsbook {
  id: string
  name: string
  slug: string
  active: boolean
  regions: string[]
  features: string[]
}

/** Event info */
export interface Event {
  id: string
  sport: string
  league: string
  homeTeam: string
  awayTeam: string
  startTime: string
  isLive: boolean
  status: 'upcoming' | 'live' | 'ended'
}

/** Account/key info */
export interface AccountInfo {
  key: {
    id: string
    tier: string
    userId: string
  }
  limits: {
    requestsPerMinute: number
    maxStreams: number
    oddsDelaySeconds: number
    maxBooks: number
  }
  features: {
    ev: boolean
    arbitrage: boolean
    middles: boolean
    streaming: boolean
  }
  addOns: string[]
}

// =============================================================================
// Query Parameters
// =============================================================================

export interface OddsParams {
  sportsbook?: string | string[]
  add_sportsbook?: string | string[]
  league?: string | string[]
  market?: string
  live?: boolean
  main?: boolean
  limit?: number
  offset?: number
}

export interface EventsParams {
  sport?: string
  league?: string | string[]
  live?: boolean
  date?: string
  limit?: number
  offset?: number
}

export interface ArbitrageParams {
  sport?: string
  league?: string
  min_profit?: number
  add_sportsbook?: string | string[]
  format?: 'json' | 'csv'
  limit?: number
}

export interface EVParams {
  sport?: string
  league?: string
  min_ev?: number
  sportsbook?: string
  add_sportsbook?: string | string[]
  limit?: number
}

export interface MiddlesParams {
  sport?: string
  league?: string
  sportsbook?: string | string[]
  market?: string
  min_size?: number
  live?: boolean
  sort?: 'quality' | 'ev' | 'probability' | 'middle_size'
  limit?: number
  offset?: number
}

export interface StreamParams {
  sportsbook?: string | string[]
  add_sportsbook?: string | string[]
  league?: string | string[]
  eventId?: string
}

// =============================================================================
// HTTP Client
// =============================================================================

const RETRY_STATUSES = new Set([502, 503, 504])
const RETRY_MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 500
const RETRY_MAX_DELAY_MS = 4000

function retryDelay(attempt: number): number {
  const ceiling = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
    RETRY_MAX_DELAY_MS,
  )
  return Math.random() * ceiling
}

class HttpClient {
  private _apiKey: string
  private baseUrl: string
  private timeout: number

  constructor(config: SharpAPIConfig) {
    this._apiKey = config.apiKey
    this.baseUrl = config.baseUrl || DEFAULT_CONFIG.baseUrl
    this.timeout = config.timeout || DEFAULT_CONFIG.timeout
  }

  /** Exposed for StreamResource — SSE URL requires the key as a query param. */
  get apiKey(): string {
    return this._apiKey
  }

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(path, this.baseUrl)

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            url.searchParams.set(key, value.join(','))
          } else {
            url.searchParams.set(key, String(value))
          }
        }
      })
    }

    return url.toString()
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const url = this.buildUrl(path, params)
    const init: RequestInit = {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    }
    if (body !== undefined) init.body = JSON.stringify(body)

    let lastNetworkError: Error | undefined
    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)
      let response: Response | undefined
      let networkError: Error | undefined

      try {
        response = await fetch(url, { ...init, signal: controller.signal })
      } catch (err) {
        networkError = err as Error
        if (networkError.name === 'AbortError') {
          clearTimeout(timeoutId)
          const error: Error & { code?: string } = new Error('Request timeout')
          error.code = 'timeout'
          throw error
        }
      } finally {
        clearTimeout(timeoutId)
      }

      const transient =
        networkError !== undefined ||
        (response !== undefined && RETRY_STATUSES.has(response.status))
      if (attempt < RETRY_MAX_ATTEMPTS && transient) {
        lastNetworkError = networkError
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)))
        continue
      }

      if (networkError) throw networkError
      if (!response) throw lastNetworkError ?? new Error('No response')

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as APIError
        const error: Error & { code?: string; status?: number } = new Error(
          errorData.error?.message || `HTTP ${response.status}`,
        )
        error.code = errorData.error?.code || 'unknown_error'
        error.status = response.status
        throw error
      }

      return response.json() as Promise<T>
    }

    throw lastNetworkError ?? new Error('Max retries exceeded')
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, undefined, params)
  }

  async post<T>(
    path: string,
    body?: unknown,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>('POST', path, body, params)
  }

  getStreamUrl(path: string, params?: Record<string, unknown>): string {
    const url = this.buildUrl(path, { ...params, api_key: this.apiKey })
    return url
  }
}

// =============================================================================
// SSE Stream Manager
// =============================================================================

export type StreamEventType = 'initial' | 'update' | 'heartbeat' | 'error'

export interface StreamEvent<T = unknown> {
  type: StreamEventType
  data: T
  timestamp: string
}

export type StreamEventHandler<T> = (event: StreamEvent<T>) => void

export class StreamManager<T = unknown> {
  private url: string
  private eventSource: EventSource | null = null
  private handlers: Map<StreamEventType, Set<StreamEventHandler<T>>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(url: string) {
    this.url = url
  }

  on(event: StreamEventType, handler: StreamEventHandler<T>): this {
    let handlers = this.handlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.handlers.set(event, handlers)
    }
    handlers.add(handler)
    return this
  }

  off(event: StreamEventType, handler: StreamEventHandler<T>): this {
    this.handlers.get(event)?.delete(handler)
    return this
  }

  private emit(event: StreamEventType, data: T, timestamp?: string): void {
    const handlers = this.handlers.get(event)
    if (handlers) {
      const streamEvent: StreamEvent<T> = {
        type: event,
        data,
        timestamp: timestamp || new Date().toISOString(),
      }
      handlers.forEach((handler) => {
        handler(streamEvent)
      })
    }
  }

  connect(): this {
    if (typeof EventSource === 'undefined') {
      console.error('[SharpAPI] EventSource not available in this environment')
      return this
    }

    if (this.eventSource) {
      this.disconnect()
    }

    this.eventSource = new EventSource(this.url)

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0
    }

    this.eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        const type = parsed.type === 'initial' ? 'initial' : 'update'
        this.emit(type, parsed.data || parsed, parsed.timestamp)
      } catch (err) {
        console.error('[SharpAPI] Failed to parse SSE message:', err)
      }
    }

    this.eventSource.addEventListener('heartbeat', () => {
      this.emit('heartbeat', {} as T)
    })

    this.eventSource.onerror = () => {
      this.emit('error', { message: 'Connection error' } as T)
      this.scheduleReconnect()
    }

    return this
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SharpAPI] Max reconnection attempts reached')
      return
    }

    const delay = this.reconnectDelay * 2 ** this.reconnectAttempts
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++
      this.connect()
    }, delay)
  }

  disconnect(): this {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    return this
  }

  get connected(): boolean {
    return this.eventSource?.readyState === 1 // EventSource.OPEN
  }
}

// =============================================================================
// WebSocket Stream Manager
// =============================================================================

export type WebSocketEventType =
  | 'connected'
  | 'subscribed'
  | 'initial'
  | 'snapshot_complete'
  | 'odds_update'
  | 'ev:detected'
  | 'ev:expired'
  | 'arb:detected'
  | 'arb:expired'
  | 'middles:detected'
  | 'middles:expired'
  | 'heartbeat'
  | 'pong'
  | 'error'

export interface WebSocketMessage<T = unknown> {
  type: WebSocketEventType
  timestamp?: string
  data?: T
  /** Sportsbook filters (on subscribed) */
  sportsbooks?: string[]
  /** League filters (on subscribed) */
  leagues?: string[]
  /** Source book (on initial/odds_update) */
  source?: string
  /** Odds count (on initial/odds_update) */
  count?: number
  /** Books included (on snapshot_complete) */
  books?: string[]
  /** Error code or close code */
  code?: string | number
  /** Welcome or error message */
  message?: string
  /** Stream ID (on connected) */
  stream_id?: string
  /** Subscription tier (on connected) */
  tier?: string
  /** Tier features (on connected) */
  features?: { ev: boolean; arbitrage: boolean; middles: boolean }
}

export type WebSocketEventHandler<T> = (message: WebSocketMessage<T>) => void

export interface WebSocketFilters {
  sportsbooks?: string[]
  leagues?: string[]
}

/**
 * WebSocket Stream Manager for real-time odds updates
 *
 * Provides lower latency than SSE (~100ms vs 1-2s).
 *
 * @example
 * ```typescript
 * const stream = api.stream.oddsWs({ sportsbooks: ['draftkings'] })
 * stream.on('initial', ({ data }) => setOdds(data))
 * stream.on('odds_update', ({ data, source }) => updateOdds(source, data))
 * stream.connect()
 * ```
 */
export class WebSocketStreamManager<T = unknown> {
  private url: string
  private ws: WebSocket | null = null
  private handlers: Map<WebSocketEventType, Set<WebSocketEventHandler<T>>> =
    new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private filters: WebSocketFilters | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null

  constructor(url: string, filters?: WebSocketFilters) {
    this.url = url
    this.filters = filters || null
  }

  /**
   * Register a handler for a specific event type
   */
  on(event: WebSocketEventType, handler: WebSocketEventHandler<T>): this {
    let handlers = this.handlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.handlers.set(event, handlers)
    }
    handlers.add(handler)
    return this
  }

  /**
   * Remove a handler for a specific event type
   */
  off(event: WebSocketEventType, handler: WebSocketEventHandler<T>): this {
    this.handlers.get(event)?.delete(handler)
    return this
  }

  private emit(message: WebSocketMessage<T>): void {
    const eventType = message.type as WebSocketEventType
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      handlers.forEach((handler) => {
        handler(message)
      })
    }
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): this {
    if (typeof WebSocket === 'undefined') {
      console.error('[SharpAPI] WebSocket not available in this environment')
      return this
    }

    if (this.ws) {
      this.disconnect()
    }

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0

      // Send subscribe message with filters
      const subscribeMsg: { type: string; filters?: WebSocketFilters } = {
        type: 'subscribe',
      }
      if (this.filters) {
        subscribeMsg.filters = this.filters
      }
      this.send(subscribeMsg)

      // Start ping interval to keep connection alive
      this.pingInterval = setInterval(() => {
        this.send({ type: 'ping' })
      }, 25000) // Ping every 25s (server timeout is 30s)
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage<T>
        this.emit(message)
      } catch (err) {
        console.error('[SharpAPI] Failed to parse WebSocket message:', err)
      }
    }

    this.ws.onclose = (event) => {
      this.cleanup()

      if (event.code === 1000) return // Normal close

      // Emit error with server-provided reason if available
      this.emit({
        type: 'error',
        code: event.code >= 4000 ? `ws_${event.code}` : 'disconnected',
        message: event.reason || 'Connection closed',
      })

      // Don't reconnect on permanent failures (auth, access, rate limit)
      const NON_RETRIABLE = [4001, 4003, 4029]
      if (!NON_RETRIABLE.includes(event.code)) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      this.emit({
        type: 'error',
        code: 'connection_error',
        message: 'WebSocket error',
      })
    }

    return this
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SharpAPI] Max WebSocket reconnection attempts reached')
      this.emit({
        type: 'error',
        code: 'max_retries',
        message: 'Max reconnection attempts reached',
      })
      return
    }

    const delay = this.reconnectDelay * 2 ** this.reconnectAttempts
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++
      this.connect()
    }, delay)
  }

  /**
   * Send a message to the server
   */
  send(message: object): void {
    if (this.ws && this.ws.readyState === 1) {
      // WebSocket.OPEN
      this.ws.send(JSON.stringify(message))
    }
  }

  /**
   * Update subscription filters
   */
  updateFilters(filters: WebSocketFilters): void {
    this.filters = filters
    if (this.connected) {
      this.send({ type: 'subscribe', filters })
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): this {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.cleanup()

    if (this.ws) {
      this.ws.close(1000) // Normal closure
      this.ws = null
    }

    return this
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.ws?.readyState === 1 // WebSocket.OPEN
  }
}

// =============================================================================
// API Resource Classes
// =============================================================================

class SportsResource {
  constructor(private http: HttpClient) {}

  /** List all sports */
  async list(): Promise<APIResponse<Sport[]>> {
    return this.http.get('/api/v1/sports')
  }

  /** Get a specific sport */
  async get(sportId: string): Promise<APIResponse<Sport>> {
    return this.http.get(`/api/v1/sports/${sportId}`)
  }
}

class LeaguesResource {
  constructor(private http: HttpClient) {}

  /** List all leagues */
  async list(params?: { sport?: string }): Promise<APIResponse<League[]>> {
    return this.http.get('/api/v1/leagues', params)
  }

  /** Get a specific league */
  async get(leagueId: string): Promise<APIResponse<League>> {
    return this.http.get(`/api/v1/leagues/${leagueId}`)
  }
}

class SportsbooksResource {
  constructor(private http: HttpClient) {}

  /** List all sportsbooks */
  async list(): Promise<APIResponse<Sportsbook[]>> {
    return this.http.get('/api/v1/sportsbooks')
  }

  /** Get a specific sportsbook */
  async get(bookId: string): Promise<APIResponse<Sportsbook>> {
    return this.http.get(`/api/v1/sportsbooks/${bookId}`)
  }
}

class EventsResource {
  constructor(private http: HttpClient) {}

  /** List events */
  async list(params?: EventsParams): Promise<APIResponse<Event[]>> {
    return this.http.get('/api/v1/events', params as Record<string, unknown>)
  }

  /** Get a specific event */
  async get(eventId: string): Promise<APIResponse<Event>> {
    return this.http.get(`/api/v1/events/${eventId}`)
  }

  /** Get markets for an event */
  async markets(eventId: string): Promise<APIResponse<string[]>> {
    return this.http.get(`/api/v1/events/${eventId}/markets`)
  }
}

class OddsResource {
  constructor(private http: HttpClient) {}

  /** Get odds snapshot */
  async get(params?: OddsParams): Promise<APIResponse<NormalizedOdds[]>> {
    return this.http.get('/api/v1/odds', params as Record<string, unknown>)
  }

  /** Get best odds across books */
  async best(params?: OddsParams): Promise<APIResponse<NormalizedOdds[]>> {
    return this.http.get('/api/v1/odds/best', params as Record<string, unknown>)
  }

  /** Get odds comparison */
  async comparison(
    params?: OddsParams,
  ): Promise<APIResponse<Record<string, NormalizedOdds[]>>> {
    return this.http.get(
      '/api/v1/odds/comparison',
      params as Record<string, unknown>,
    )
  }

  /** Batch get odds for multiple events */
  async batch(eventIds: string[]): Promise<APIResponse<NormalizedOdds[]>> {
    return this.http.post('/api/v1/odds/batch', { event_ids: eventIds })
  }
}

class ArbitrageResource {
  constructor(private http: HttpClient) {}

  /** Get arbitrage opportunities */
  async get(
    params?: ArbitrageParams,
  ): Promise<APIResponse<ArbitrageOpportunity[]>> {
    return this.http.get(
      '/api/v1/opportunities/arbitrage',
      params as Record<string, unknown>,
    )
  }

  /** Get arbitrage as CSV */
  async csv(params?: Omit<ArbitrageParams, 'format'>): Promise<string> {
    const url = new URL(
      '/api/v1/opportunities/arbitrage',
      'https://api.sharpapi.io',
    )
    url.searchParams.set('format', 'csv')
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) url.searchParams.set(k, String(v))
      })
    }
    const response = await fetch(url.toString())
    return response.text()
  }
}

class EVResource {
  constructor(private http: HttpClient) {}

  /** Get +EV opportunities */
  async get(params?: EVParams): Promise<APIResponse<EVOpportunity[]>> {
    return this.http.get(
      '/api/v1/opportunities/ev',
      params as Record<string, unknown>,
    )
  }
}

class MiddlesResource {
  constructor(private http: HttpClient) {}

  /** Get middle opportunities */
  async get(params?: MiddlesParams): Promise<APIResponse<MiddleOpportunity[]>> {
    return this.http.get(
      '/api/v1/opportunities/middles',
      params as Record<string, unknown>,
    )
  }
}

class AccountResource {
  constructor(private http: HttpClient) {}

  /** Get account info */
  async me(): Promise<APIResponse<AccountInfo>> {
    return this.http.get('/api/v1/account')
  }

  /** Get usage stats */
  async usage(): Promise<APIResponse<{ requests: number; streams: number }>> {
    return this.http.get('/api/v1/account/usage')
  }
}

class StreamResource {
  private apiKey: string

  constructor(private http: HttpClient) {
    this.apiKey = http.apiKey
  }

  /** Create odds stream (SSE) */
  odds(params?: StreamParams): StreamManager<NormalizedOdds[]> {
    const url = this.http.getStreamUrl('/api/v1/stream', {
      ...params,
      type: 'odds',
    } as Record<string, unknown>)
    return new StreamManager(url)
  }

  /** Create opportunities stream (EV + Arbitrage) - SSE */
  opportunities(
    params?: StreamParams,
  ): StreamManager<{ ev: EVOpportunity[]; arbitrage: ArbitrageOpportunity[] }> {
    const url = this.http.getStreamUrl('/api/v1/stream', {
      ...params,
      type: 'opportunities',
    } as Record<string, unknown>)
    return new StreamManager(url)
  }

  /** Create unified stream (odds + opportunities) - SSE */
  all(params?: StreamParams): StreamManager<Record<string, unknown>> {
    const url = this.http.getStreamUrl('/api/v1/stream', {
      ...params,
      type: 'all',
    } as Record<string, unknown>)
    return new StreamManager(url)
  }

  /** Create single event stream (SSE) */
  event(
    eventId: string,
    params?: StreamParams,
  ): StreamManager<NormalizedOdds[]> {
    const url = this.http.getStreamUrl('/api/v1/stream', {
      ...params,
      type: 'odds',
      eventId,
    } as Record<string, unknown>)
    return new StreamManager(url)
  }

  /**
   * Create WebSocket odds stream (lower latency than SSE)
   *
   * Connects to wss://ws.sharpapi.io for real-time updates.
   * Latency: ~100ms (vs 1-2s for SSE)
   *
   * @example
   * ```typescript
   * const stream = api.stream.oddsWs({ sportsbooks: ['draftkings', 'fanduel'] })
   * stream.on('connected', ({ message, tier }) => console.log(message, tier))
   * stream.on('initial', ({ data }) => setAllOdds(data))
   * stream.on('odds_update', ({ data, source }) => updateBook(source, data))
   * stream.on('ev:detected', ({ data }) => notifyEV(data))
   * stream.on('heartbeat', () => console.log('alive'))
   * stream.on('error', ({ message }) => console.error(message))
   * stream.connect()
   * ```
   */
  oddsWs(params?: StreamParams): WebSocketStreamManager<NormalizedOdds[]> {
    // Build WebSocket URL with API key
    const wsUrl = new URL('wss://ws.sharpapi.io')
    wsUrl.searchParams.set('api_key', this.apiKey)

    // Convert params to WebSocket filters
    const filters: WebSocketFilters = {}
    if (params?.sportsbook) {
      filters.sportsbooks = Array.isArray(params.sportsbook)
        ? params.sportsbook
        : [params.sportsbook]
    }
    if (params?.league) {
      filters.leagues = Array.isArray(params.league)
        ? params.league
        : [params.league]
    }

    return new WebSocketStreamManager(
      wsUrl.toString(),
      Object.keys(filters).length > 0 ? filters : undefined,
    )
  }
}

// =============================================================================
// Main Client Class
// =============================================================================

/**
 * SharpAPI Client
 *
 * @example
 * ```typescript
 * const api = new SharpAPI('sk_xxx')
 *
 * // Get odds
 * const { data } = await api.odds.get({ league: 'NBA' })
 *
 * // Get arbitrage opportunities
 * const { data: arbs } = await api.arbitrage.get({ min_profit: 1 })
 *
 * // Stream odds (requires WebSocket add-on)
 * const stream = api.stream.odds({ league: 'NBA' })
 * stream.on('update', ({ data }) => console.log(data))
 * stream.connect()
 * ```
 */
export class SharpAPI {
  private http: HttpClient

  /** Sports endpoints */
  readonly sports: SportsResource
  /** Leagues endpoints */
  readonly leagues: LeaguesResource
  /** Sportsbooks endpoints */
  readonly sportsbooks: SportsbooksResource
  /** Events endpoints */
  readonly events: EventsResource
  /** Odds endpoints */
  readonly odds: OddsResource
  /** Arbitrage endpoints (Pro+ tier) */
  readonly arbitrage: ArbitrageResource
  /** +EV endpoints (Pro+ tier) */
  readonly ev: EVResource
  /** Middles endpoints (Pro+ tier) */
  readonly middles: MiddlesResource
  /** Account endpoints */
  readonly account: AccountResource
  /** Streaming endpoints (requires WebSocket add-on) */
  readonly stream: StreamResource

  constructor(apiKey: string, options?: Omit<SharpAPIConfig, 'apiKey'>) {
    this.http = new HttpClient({ apiKey, ...options })

    this.sports = new SportsResource(this.http)
    this.leagues = new LeaguesResource(this.http)
    this.sportsbooks = new SportsbooksResource(this.http)
    this.events = new EventsResource(this.http)
    this.odds = new OddsResource(this.http)
    this.arbitrage = new ArbitrageResource(this.http)
    this.ev = new EVResource(this.http)
    this.middles = new MiddlesResource(this.http)
    this.account = new AccountResource(this.http)
    this.stream = new StreamResource(this.http)
  }
}

// =============================================================================
// Default Export & Convenience Functions
// =============================================================================

export default SharpAPI

/** Create a new SharpAPI client */
export function createClient(
  apiKey: string,
  options?: Omit<SharpAPIConfig, 'apiKey'>,
): SharpAPI {
  return new SharpAPI(apiKey, options)
}
