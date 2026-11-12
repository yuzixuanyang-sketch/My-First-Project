import type { IMarketDataProvider } from './simulator'
import type { MarketStatus, PricePoint, Quote, RangeKey, StockMeta } from '../types'
import { STOCKS } from './simulator'

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    retryAfter?: number
  }
}

interface HealthResponse {
  configured: boolean
  provider: string
  feed: string
}

interface BootstrapResponse {
  source: {
    provider: 'Alpaca'
    feed: 'IEX'
    isSimulated: false
    description: string
  }
  quotes: Record<string, Quote>
  sparklines: Record<string, PricePoint[]>
  fetchedAt: number
}

interface BarsResponse {
  source: BootstrapResponse['source']
  range: RangeKey
  bars: PricePoint[]
  fetchedAt: number
}

type StreamMessage =
  | { type: 'status'; status: { state: MarketStatus['state']; code: string | null; message: string; updatedAt: number | null; nextRetryAt: number | null } }
  | { type: 'quote'; quote: Quote }

const REAL_SOURCE: MarketStatus['source'] = {
  provider: 'Alpaca',
  feed: 'IEX',
  isSimulated: false,
  description: '真实 IEX 实时行情，不是全市场 SIP 行情',
}

function errorMessage(message: string, code: string, status = 502, retryAfter?: number) {
  return Object.assign(new Error(message), { code, status, retryAfter })
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) {
    let body: ApiErrorBody | null = null
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      body = null
    }
    throw errorMessage(
      body?.error?.message ?? `行情服务返回错误 ${response.status}`,
      body?.error?.code ?? 'MARKET_SERVICE_ERROR',
      response.status,
      body?.error?.retryAfter,
    )
  }
  return (await response.json()) as T
}

function streamUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/api/market/stream`
}

/** 通过本地后端代理访问 Alpaca；浏览器不接触任何 API 密钥 */
export class AlpacaMarketProvider implements IMarketDataProvider {
  readonly isSimulated = false

  private quotes = new Map<string, Quote>()
  private histories = new Map<string, PricePoint[]>()
  private listeners = new Set<() => void>()
  private socket: WebSocket | null = null
  private socketAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private version = 0
  private status: MarketStatus = {
    state: 'idle',
    code: null,
    message: '尚未连接 Alpaca IEX 行情',
    source: REAL_SOURCE,
    updatedAt: null,
    nextRetryAt: null,
  }

  private notify() {
    this.version++
    this.listeners.forEach((listener) => listener())
  }

  private setStatus(next: Partial<MarketStatus>) {
    this.status = { ...this.status, ...next }
    this.notify()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.quotes.clear()
    this.histories.clear()
    this.socketAttempts = 0
    this.setStatus({
      state: 'connecting',
      code: null,
      message: '正在连接 Alpaca IEX 行情服务',
      updatedAt: Date.now(),
      nextRetryAt: null,
    })
    void this.initialize()
  }

  private async initialize() {
    try {
      const health = await requestJson<HealthResponse>('/api/health')
      if (!health.configured) {
        this.setStatus({
          state: 'unavailable',
          code: 'NOT_CONFIGURED',
          message: '未配置 Alpaca API 密钥，真实 IEX 行情不可用',
          updatedAt: Date.now(),
          nextRetryAt: null,
        })
        return
      }
      await this.loadBootstrap()
      if (this.running) this.connectSocket()
    } catch (error) {
      this.setStatus({
        state: 'error',
        code: error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : 'MARKET_SERVICE_ERROR',
        message: error instanceof Error ? error.message : 'Alpaca IEX 行情服务连接失败',
        updatedAt: Date.now(),
        nextRetryAt: null,
      })
    }
  }

  private async loadBootstrap() {
    const data = await requestJson<BootstrapResponse>('/api/market/bootstrap')
    this.quotes = new Map(Object.entries(data.quotes))
    for (const [symbol, points] of Object.entries(data.sparklines)) {
      if (points.length > 1) this.histories.set(`${symbol}:1W`, points)
    }
    this.setStatus({
      state: 'connecting',
      code: null,
      message: '已获取 Alpaca IEX 报价，等待实时连接',
      updatedAt: Date.now(),
      nextRetryAt: null,
    })
    this.notify()
  }

  private connectSocket() {
    if (!this.running || this.socket) return
    const socket = new WebSocket(streamUrl())
    this.socket = socket
    socket.addEventListener('open', () => {
      this.socketAttempts = 0
    })
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data) as StreamMessage
        if (message.type === 'status') {
          this.setStatus({
            state: message.status.state,
            code: message.status.code,
            message: message.status.message,
            updatedAt: message.status.updatedAt,
            nextRetryAt: message.status.nextRetryAt,
          })
          return
        }
        this.updateQuote(message.quote)
      } catch {
        // 忽略无法解析的消息，保持连接状态
      }
    })
    socket.addEventListener('error', () => {
      if (this.socket !== socket) return
      this.setStatus({
        state: 'error',
        code: 'LOCAL_STREAM_ERROR',
        message: '无法连接本地行情推送服务',
        updatedAt: Date.now(),
        nextRetryAt: null,
      })
    })
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      if (!this.running) return
      this.scheduleSocketReconnect()
    })
  }

  private scheduleSocketReconnect() {
    if (this.reconnectTimer) return
    const delay = Math.min(30000, 1000 * 2 ** this.socketAttempts)
    this.socketAttempts += 1
    this.setStatus({
      state: 'reconnecting',
      code: 'LOCAL_STREAM_DISCONNECTED',
      message: `本地行情连接断开，${Math.round(delay / 1000)} 秒后自动重连`,
      updatedAt: Date.now(),
      nextRetryAt: Date.now() + delay,
    })
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connectSocket()
    }, delay)
  }

  private updateQuote(quote: Quote) {
    if (!quote || !Number.isFinite(quote.price)) return
    const next = { ...quote }
    this.quotes.set(next.symbol, next)
    const key = `${next.symbol}:1D`
    const history = this.histories.get(key)
    if (history) {
      const timestamp = next.updatedAt ?? Date.now()
      const last = history[history.length - 1]
      if (last && timestamp - last.t < 5000) {
        history[history.length - 1] = { t: timestamp, price: next.price }
      } else {
        history.push({ t: timestamp, price: next.price })
        if (history.length > 2000) history.splice(0, history.length - 2000)
      }
    }
    this.notify()
  }

  getMetas(): StockMeta[] {
    return STOCKS
  }

  getQuote(symbol: string): Quote | undefined {
    return this.quotes.get(symbol)
  }

  getQuotes(): Quote[] {
    return [...this.quotes.values()]
  }

  getHistory(symbol: string, range: RangeKey): PricePoint[] {
    return this.histories.get(`${symbol}:${range}`) ?? []
  }

  async loadHistory(symbol: string, range: RangeKey): Promise<PricePoint[]> {
    const data = await requestJson<BarsResponse>(
      `/api/market/bars?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`,
    )
    const points = data.bars.filter(
      (point) => Number.isFinite(point.t) && Number.isFinite(point.price),
    )
    if (points.length > 0) this.histories.set(`${symbol}:${range}`, points)
    this.notify()
    return points
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion(): number {
    return this.version
  }

  getStatus(): MarketStatus {
    return this.status
  }

  retry(): void {
    this.stop()
    this.start()
  }

  stop(): void {
    this.running = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      const socket = this.socket
      this.socket = null
      socket.close()
    }
    this.setStatus({
      state: 'idle',
      code: null,
      message: '已停止 Alpaca IEX 行情',
      updatedAt: Date.now(),
      nextRetryAt: null,
    })
  }
}
