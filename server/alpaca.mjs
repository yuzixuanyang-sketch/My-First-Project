import { config } from './env.mjs'

export const SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'TSLA', 'META', 'SPY', 'QQQ']

const REST_HOST = 'https://data.alpaca.markets/v2'
const STREAM_URL = 'wss://stream.data.alpaca.markets/v2/iex'
const REQUEST_TIMEOUT_MS = 12000
const RANGE_CONFIG = {
  '1D': { timeframe: '5Min', start: () => Date.now() - 24 * 60 * 60 * 1000, ttl: 10_000 },
  '1W': { timeframe: '1Hour', start: () => Date.now() - 7 * 24 * 60 * 60 * 1000, ttl: 60_000 },
  '1M': { timeframe: '1Day', start: () => Date.now() - 32 * 24 * 60 * 60 * 1000, ttl: 300_000 },
  '3M': { timeframe: '1Day', start: () => Date.now() - 94 * 24 * 60 * 60 * 1000, ttl: 300_000 },
  '1Y': { timeframe: '1Day', start: () => Date.now() - 366 * 24 * 60 * 60 * 1000, ttl: 600_000 },
}

function safeSymbol(symbol) {
  const value = String(symbol ?? '').toUpperCase()
  if (!SYMBOLS.includes(value)) throw Object.assign(new Error('不支持的股票代码'), { status: 400, code: 'INVALID_SYMBOL' })
  return value
}

function dateInNewYork(timestamp) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp))
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function classifyError(error, response) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return { status: 504, code: 'UPSTREAM_TIMEOUT', message: 'Alpaca 请求超时，请稍后重试' }
  }
  if (error?.name === 'TypeError') {
    return { status: 502, code: 'NETWORK_ERROR', message: '无法连接 Alpaca 行情服务' }
  }
  const status = response?.status ?? 502
  const map = {
    401: ['UNAUTHORIZED', 'Alpaca 密钥无效或已过期'],
    403: ['FORBIDDEN', '当前 Alpaca 订阅无权访问该行情数据'],
    404: ['NOT_FOUND', '未找到对应行情数据'],
    429: ['RATE_LIMIT', '触发 Alpaca API 限流，请稍后重试'],
  }
  const fallback = [status >= 500 ? 'UPSTREAM_ERROR' : 'API_ERROR', `Alpaca 返回错误 ${status}`]
  const [code, message] = map[status] ?? fallback
  return { status, code, message, retryAfter: response?.retryAfterSeconds }
}

export class AlpacaService {
  constructor({ keyId, secretKey }) {
    this.keyId = keyId
    this.secretKey = secretKey
    this.cache = new Map()
    this.quotes = new Map()
    this.sessions = new Map()
    this.streaming = false
    this.stream = null
    this.streamAttempts = 0
    this.status = {
      state: 'idle',
      code: null,
      message: '尚未连接 Alpaca 行情',
      updatedAt: null,
      nextRetryAt: null,
    }
    this.onQuote = () => {}
    this.onStatus = () => {}
  }

  get configured() {
    return Boolean(this.keyId && this.secretKey)
  }

  getSourceInfo() {
    return {
      provider: 'Alpaca',
      feed: 'IEX',
      isSimulated: false,
      description: '真实 IEX 实时行情，不是全市场 SIP 行情',
    }
  }

  getStatus() {
    if (!this.configured) {
      return {
        ...this.status,
        state: 'unavailable',
        code: 'NOT_CONFIGURED',
        message: '未配置 Alpaca API 密钥',
      }
    }
    return this.status
  }

  async request(path, params = {}) {
    const url = new URL(`${REST_HOST}${path}`)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    }
    let response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'APCA-API-KEY-ID': this.keyId,
          'APCA-API-SECRET-KEY': this.secretKey,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      const classified = classifyError(error)
      throw Object.assign(new Error(classified.message), classified)
    }
    if (!response.ok) {
      let detail = ''
      try {
        detail = (await response.text()).slice(0, 300)
      } catch {
        detail = ''
      }
      const retryAfter = Number(response.headers.get('retry-after')) || undefined
      const classified = classifyError(null, {
        status: response.status,
        retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
      })
      throw Object.assign(new Error(detail ? `${classified.message}：${detail}` : classified.message), {
        ...classified,
        detail,
      })
    }
    return response.json()
  }

  async withCache(key, ttl, worker) {
    const now = Date.now()
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > now) return cached.value
    if (cached?.promise) return cached.promise
    const promise = (async () => {
      try {
        const value = await worker()
        this.cache.set(key, { value, expiresAt: Date.now() + ttl })
        return value
      } finally {
        const entry = this.cache.get(key)
        if (entry?.promise === promise) this.cache.delete(key)
      }
    })()
    this.cache.set(key, { promise, expiresAt: now + ttl })
    return promise
  }

  async fetchLatest(symbolString = SYMBOLS) {
    const symbols = symbolString.map(safeSymbol)
    const [trades, quotes] = await Promise.all([
      this.request('/stocks/trades/latest', {
        symbols: symbols.join(','),
        feed: 'iex',
        currency: 'USD',
      }),
      this.request('/stocks/quotes/latest', {
        symbols: symbols.join(','),
        feed: 'iex',
        currency: 'USD',
      }),
    ])
    return { trades: trades.trades ?? {}, quotes: quotes.quotes ?? {} }
  }

  async fetchDailyBars(symbols = SYMBOLS, days = 40) {
    const result = await this.request('/stocks/bars', {
      symbols: symbols.join(','),
      timeframe: '1Day',
      start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
      feed: 'iex',
      currency: 'USD',
      adjustment: 'split',
      sort: 'asc',
      limit: 10000,
    })
    return result.bars ?? {}
  }

  normalizeQuote(symbol, trade, quote, dailyBars) {
    const bars = dailyBars[symbol] ?? []
    const dayBar = bars.at(-1)
    const previousBar = bars.at(-2)
    if (!dayBar || !isFiniteNumber(dayBar.c)) return null
    const price = isFiniteNumber(trade?.p) ? trade.p : dayBar.c
    const prevClose = isFiniteNumber(previousBar?.c) ? previousBar.c : dayBar.o
    const updatedAt = Math.max(
      Date.parse(trade?.t ?? '') || 0,
      Date.parse(quote?.t ?? '') || 0,
      Date.parse(dayBar.t) || 0,
    )
    const sessionDate = dateInNewYork(Date.parse(dayBar.t))
    const high = Math.max(dayBar.h ?? price, price)
    const low = Math.min(dayBar.l ?? price, price)
    return {
      symbol,
      price,
      prevClose,
      open: dayBar.o ?? price,
      high,
      low,
      volume: dayBar.v ?? 0,
      bid: isFiniteNumber(quote?.bp) ? quote.bp : null,
      ask: isFiniteNumber(quote?.ap) ? quote.ap : null,
      bidSize: Number.isFinite(quote?.bs) ? quote.bs : null,
      askSize: Number.isFinite(quote?.as) ? quote.as : null,
      exchange: typeof trade?.x === 'string' ? trade.x : null,
      lastTradeSize: Number.isFinite(trade?.s) ? trade.s : null,
      lastTradeAt: Date.parse(trade?.t ?? '') || null,
      source: 'IEX',
      updatedAt,
      sessionDate,
    }
  }

  async getBootstrap() {
    if (!this.configured) {
      throw Object.assign(new Error('未配置 Alpaca API 密钥'), {
        status: 503,
        code: 'NOT_CONFIGURED',
      })
    }
    return this.withCache('bootstrap', 2000, async () => {
      const [{ trades, quotes }, dailyBars] = await Promise.all([
        this.fetchLatest(),
        this.fetchDailyBars(),
      ])
      const normalizedQuotes = {}
      const sparklines = {}
      for (const symbol of SYMBOLS) {
        const quote = this.normalizeQuote(symbol, trades[symbol], quotes[symbol], dailyBars)
        if (!quote) continue
        normalizedQuotes[symbol] = quote
        this.quotes.set(symbol, quote)
        this.sessions.set(symbol, { date: quote.sessionDate, close: quote.price })
        sparklines[symbol] = (dailyBars[symbol] ?? [])
          .slice(-7)
          .map((bar) => ({ t: Date.parse(bar.t), price: bar.c }))
          .filter((point) => Number.isFinite(point.t) && isFiniteNumber(point.price))
      }
      return {
        source: this.getSourceInfo(),
        quotes: normalizedQuotes,
        sparklines,
        fetchedAt: Date.now(),
      }
    })
  }

  async getHistory(symbol, range = '1D') {
    const validSymbol = safeSymbol(symbol)
    const settings = RANGE_CONFIG[range]
    if (!settings) {
      throw Object.assign(new Error('不支持的时间范围'), { status: 400, code: 'INVALID_RANGE' })
    }
    if (!this.configured) {
      throw Object.assign(new Error('未配置 Alpaca API 密钥'), {
        status: 503,
        code: 'NOT_CONFIGURED',
      })
    }
    return this.withCache(`history:${validSymbol}:${range}`, settings.ttl, async () => {
      const result = await this.request('/stocks/bars', {
        symbols: validSymbol,
        timeframe: settings.timeframe,
        start: new Date(settings.start()).toISOString(),
        feed: 'iex',
        currency: 'USD',
        adjustment: 'split',
        sort: 'asc',
        limit: 10000,
      })
      const bars = result.bars?.[validSymbol] ?? []
      return {
        source: this.getSourceInfo(),
        range,
        bars: bars.map((bar) => ({
          t: Date.parse(bar.t),
          price: bar.c,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          volume: bar.v,
        })),
        fetchedAt: Date.now(),
      }
    })
  }

  notifyStatus() {
    this.onStatus(this.getStatus())
  }

  sendStreamMessage(message) {
    if (this.stream?.readyState === WebSocket.OPEN) this.stream.send(JSON.stringify(message))
  }

  handleStreamMessage(message) {
    if (message.T === 'success') {
      if (message.msg === 'authenticated') {
        this.sendStreamMessage({
          action: 'subscribe',
          trades: SYMBOLS,
          quotes: SYMBOLS,
          bars: SYMBOLS,
        })
        this.streamAttempts = 0
        return
      }
      if (message.msg === 'connected') return
    }
    if (message.T === 'subscription') {
      this.status = {
        state: 'connected',
        code: null,
        message: '已订阅 Alpaca IEX 实时行情',
        updatedAt: Date.now(),
        nextRetryAt: null,
      }
      this.notifyStatus()
      return
    }
    if (message.T === 'error') {
      this.status = {
        state: 'error',
        code: 'STREAM_ERROR',
        message: `Alpaca 流式行情错误：${message.msg ?? '未知错误'}`,
        updatedAt: Date.now(),
        nextRetryAt: null,
      }
      this.notifyStatus()
      this.stream?.close()
      return
    }
    if (message.T === 't') this.handleTrade(message)
    if (message.T === 'q') this.handleQuoteUpdate(message)
    if (message.T === 'b' || message.T === 'u' || message.T === 'd') this.handleBar(message)
  }

  emitQuote(quote) {
    this.onQuote({ type: 'quote', quote, source: this.getSourceInfo() })
  }

  handleTrade(message) {
    const quote = this.quotes.get(message.S)
    const timestamp = Date.parse(message.t)
    if (!quote || !isFiniteNumber(message.p) || !Number.isFinite(timestamp)) return
    const tradeDate = dateInNewYork(timestamp)
    if (quote.sessionDate && tradeDate !== quote.sessionDate) {
      const session = this.sessions.get(message.S)
      quote.prevClose = session?.close ?? quote.prevClose
      quote.open = message.p
      quote.high = message.p
      quote.low = message.p
      quote.volume = Number.isFinite(message.s) ? message.s : 0
      quote.sessionDate = tradeDate
    } else {
      quote.price = message.p
      quote.high = Math.max(quote.high, message.p)
      quote.low = Math.min(quote.low, message.p)
      if (Number.isFinite(message.s)) quote.volume += message.s
    }
    quote.updatedAt = timestamp
    quote.lastTradeAt = timestamp
    quote.lastTradeSize = Number.isFinite(message.s) ? message.s : null
    quote.exchange = typeof message.x === 'string' ? message.x : quote.exchange
    this.sessions.set(message.S, { date: quote.sessionDate, close: message.p })
    this.emitQuote(quote)
  }

  handleQuoteUpdate(message) {
    const quote = this.quotes.get(message.S)
    const timestamp = Date.parse(message.t)
    if (!quote || !Number.isFinite(timestamp)) return
    if (isFiniteNumber(message.bp)) quote.bid = message.bp
    if (isFiniteNumber(message.ap)) quote.ask = message.ap
    if (Number.isFinite(message.bs)) quote.bidSize = message.bs
    if (Number.isFinite(message.as)) quote.askSize = message.as
    quote.updatedAt = timestamp
    this.emitQuote(quote)
  }

  handleBar(message) {
    const quote = this.quotes.get(message.S)
    const timestamp = Date.parse(message.t)
    if (!quote || !Number.isFinite(timestamp) || !isFiniteNumber(message.c)) return
    const barDate = dateInNewYork(timestamp)
    const isNewSession = quote.sessionDate !== barDate
    quote.open = isFiniteNumber(message.o) ? message.o : quote.open
    quote.high = isFiniteNumber(message.h) ? message.h : quote.high
    quote.low = isFiniteNumber(message.l) ? message.l : quote.low
    quote.volume = Number.isFinite(message.v) ? message.v : quote.volume
    quote.price = message.c
    quote.sessionDate = barDate
    quote.updatedAt = timestamp
    this.sessions.set(message.S, { date: barDate, close: message.c })
    if (isNewSession) quote.prevClose = message.o
    this.emitQuote(quote)
  }

  scheduleReconnect() {
    if (!this.streaming) return
    const delay = Math.min(30000, 1000 * 2 ** this.streamAttempts)
    this.streamAttempts += 1
    this.status = {
      state: 'reconnecting',
      code: 'STREAM_DISCONNECTED',
      message: `Alpaca IEX 实时连接断开，${Math.round(delay / 1000)} 秒后自动重连`,
      updatedAt: Date.now(),
      nextRetryAt: Date.now() + delay,
    }
    this.notifyStatus()
    setTimeout(() => {
      if (this.streaming) this.connect()
    }, delay)
  }

  connect() {
    if (!this.configured || this.stream) return
    this.status = {
      state: 'connecting',
      code: null,
      message: '正在连接 Alpaca IEX 实时行情',
      updatedAt: Date.now(),
      nextRetryAt: null,
    }
    this.notifyStatus()
    const stream = new WebSocket(STREAM_URL)
    this.stream = stream
    stream.addEventListener('open', () => {
      this.sendStreamMessage({
        action: 'auth',
        key: this.keyId,
        secret: this.secretKey,
      })
    })
    stream.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data)
        for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
          this.handleStreamMessage(message)
        }
      } catch {
        // 忽略无法解析的流消息，保持连接与重连状态
      }
    })
    stream.addEventListener('error', () => {
      if (this.stream !== stream) return
      this.status = {
        state: 'error',
        code: 'STREAM_ERROR',
        message: '无法连接 Alpaca IEX 实时行情服务',
        updatedAt: Date.now(),
        nextRetryAt: null,
      }
      this.notifyStatus()
      stream.close()
    })
    stream.addEventListener('close', () => {
      if (this.stream !== stream) return
      this.stream = null
      this.scheduleReconnect()
    })
  }

  startStream(onQuote, onStatus) {
    this.onQuote = onQuote
    this.onStatus = onStatus
    if (!this.configured) {
      this.notifyStatus()
      return
    }
    this.streaming = true
    this.connect()
  }

  stopStream() {
    this.streaming = false
    const stream = this.stream
    this.stream = null
    if (stream) stream.close()
    this.status = {
      state: 'idle',
      code: null,
      message: '已停止 Alpaca IEX 实时行情',
      updatedAt: Date.now(),
      nextRetryAt: null,
    }
  }
}

export const alpacaService = new AlpacaService(config)
