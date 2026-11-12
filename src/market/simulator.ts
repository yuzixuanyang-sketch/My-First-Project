import type { DailyBar, PricePoint, Quote, RangeKey, StockMeta } from '../types'

/**
 * 行情数据模块
 * ------------------------------------------------------------------
 * 当前实现为 MockMarketProvider：完全在本地生成模拟行情，
 * 不与任何真实市场数据关联，页面所有价格均为「模拟行情」。
 *
 * 未来接入真实美股行情 API 时，只需新增一个实现
 * IMarketDataProvider 接口的类（例如 RestMarketProvider），
 * 并把文件底部的 marketProvider 替换为该实现即可，
 * 上层 React 代码无需改动。
 */
export interface IMarketDataProvider {
  /** 是否为模拟行情（用于界面标注） */
  readonly isSimulated: boolean
  getMetas(): StockMeta[]
  getQuote(symbol: string): Quote | undefined
  getQuotes(): Quote[]
  getHistory(symbol: string, range: RangeKey): PricePoint[]
  /** 订阅报价更新，返回取消订阅函数 */
  subscribe(listener: () => void): () => void
  /** 行情版本号，每次 tick 递增（供 React 外部 store 使用） */
  getVersion(): number
  /** 启动/停止行情推送 */
  start(): void
  stop(): void
}

/** 本地模拟模式覆盖的股票 / ETF */
export const STOCKS: StockMeta[] = [
  { symbol: 'AAPL', name: '苹果', basePrice: 232.5, volatility: 0.26 },
  { symbol: 'MSFT', name: '微软', basePrice: 428.0, volatility: 0.24 },
  { symbol: 'NVDA', name: '英伟达', basePrice: 138.2, volatility: 0.5 },
  { symbol: 'AMZN', name: '亚马逊', basePrice: 205.7, volatility: 0.32 },
  { symbol: 'GOOGL', name: '谷歌', basePrice: 176.3, volatility: 0.28 },
  { symbol: 'TSLA', name: '特斯拉', basePrice: 248.9, volatility: 0.55 },
  { symbol: 'META', name: 'Meta', basePrice: 582.4, volatility: 0.34 },
  { symbol: 'SPY', name: '标普500 ETF', basePrice: 585.1, volatility: 0.13 },
  { symbol: 'QQQ', name: '纳斯达克100 ETF', basePrice: 505.6, volatility: 0.18 },
]

const DAY_MS = 24 * 60 * 60 * 1000
const HISTORY_DAYS = 365
const TICK_MS = 3000
/** 单次跳动最大幅度 */
const TICK_SIGMA = 0.0012
const MIN_PRICE = 0.5
const roundPrice = (value: number) => Math.max(MIN_PRICE, Math.round(value * 100) / 100)

/** 由字符串生成稳定种子 */
function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 伪随机数发生器（按股票代码播种，保证走势连续且可复现） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box-Muller 生成标准正态分布 */
function gauss(rand: () => number): number {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

interface StockState {
  meta: StockMeta
  quote: Quote
  daily: DailyBar[] // 截止昨天的日 K
  intraday: PricePoint[] // 今日分时
  rand: () => number
}

function todayMidnight(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

class MockMarketProvider implements IMarketDataProvider {
  readonly isSimulated = true
  private states = new Map<string, StockState>()
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private version = 0

  constructor() {
    for (const meta of STOCKS) {
      this.states.set(meta.symbol, this.buildState(meta))
    }
  }

  /** 构建单只股票的完整模拟状态：一年日 K + 今日分时 */
  private buildState(meta: StockMeta): StockState {
    const rand = mulberry32(hashSeed(meta.symbol))
    const dailyVol = meta.volatility / Math.sqrt(252)

    // 从基准价向前回推一年日 K，保证走势连续且今天接着昨天
    const closes: number[] = [meta.basePrice]
    for (let i = 1; i < HISTORY_DAYS; i++) {
      const r = gauss(rand) * dailyVol + 0.0003 // 微弱上行漂移
      const prev = closes[i - 1] / (1 + r)
      closes.push(Math.max(MIN_PRICE, prev))
    }
    closes.reverse() // 时间升序，最后一个为昨收

    const t0 = todayMidnight()
    const daily: DailyBar[] = closes.map((c, i) => {
      const span = c * dailyVol * 0.8
      const o = c * (1 + gauss(rand) * dailyVol * 0.3)
      return {
        t: t0 - (closes.length - i) * DAY_MS,
        o,
        h: Math.max(o, c) + (Math.abs(gauss(rand)) * span) / 2,
        l: Math.max(MIN_PRICE, Math.min(o, c) - (Math.abs(gauss(rand)) * span) / 2),
        c,
        v: Math.round(8e6 + rand() * 6e7),
      }
    })

    const prevClose = roundPrice(daily[daily.length - 1].c)
    // 今日开盘：相对昨收小幅跳空
    const open = roundPrice(prevClose * (1 + gauss(rand) * dailyVol * 0.5))

    // 分时终点固定为当前时间，避免末点晚于实时 tick 导致时间倒序。
    // 时间序列仅用于模拟图表，不代表真实交易时段。
    const intraday: PricePoint[] = []
    let price = open
    const now = Date.now()
    const steps = 78
    const interval = Math.min(5 * 60 * 1000, Math.max(1000, (now - t0) / steps))
    for (let i = 0; i <= steps; i++) {
      intraday.push({ t: now - (steps - i) * interval, price })
      price = roundPrice(price * (1 + gauss(rand) * dailyVol * 0.15))
    }

    const prices = intraday.map((p) => p.price)
    const quote: Quote = {
      symbol: meta.symbol,
      price,
      prevClose,
      open,
      high: Math.max(...prices, price),
      low: Math.min(...prices, price),
      volume: Math.round(5e6 + rand() * 4e7),
    }
    intraday.push({ t: now, price })

    return { meta, quote, daily, intraday, rand }
  }

  /** 每个 tick 推动所有股票价格小幅波动 */
  private tick = () => {
    const now = Date.now()
    for (const s of this.states.values()) {
      const { quote, rand } = s
      const next = roundPrice(quote.price * (1 + gauss(rand) * TICK_SIGMA))
      quote.price = next
      quote.high = Math.max(quote.high, next)
      quote.low = Math.min(quote.low, next)
      quote.volume += Math.round(rand() * 120000)
      s.intraday.push({ t: now, price: next })
      if (s.intraday.length > 2000) s.intraday.splice(0, s.intraday.length - 2000)
    }
    this.version++
    this.listeners.forEach((fn) => fn())
  }

  getVersion(): number {
    return this.version
  }

  getMetas(): StockMeta[] {
    return STOCKS
  }

  getQuote(symbol: string): Quote | undefined {
    return this.states.get(symbol)?.quote
  }

  getQuotes(): Quote[] {
    return STOCKS.map((m) => this.states.get(m.symbol)!.quote)
  }

  getHistory(symbol: string, range: RangeKey): PricePoint[] {
    const s = this.states.get(symbol)
    if (!s) return []
    const now = Date.now()
    if (range === '1D') return s.intraday.slice()
    const days = { '1W': 5, '1M': 22, '3M': 66, '1Y': 252 }[range]
    const pts: PricePoint[] = s.daily.slice(-days).map((b) => ({ t: b.t, price: b.c }))
    // 末尾接上当前实时价，保证图表与报价一致、连续
    pts.push({ t: now, price: s.quote.price })
    return pts
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (!this.timer) this.timer = setInterval(this.tick, TICK_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}

/** 本地模拟备用 Provider，仅由用户显式切换使用，不冒充真实行情 */
export const mockMarketProvider: IMarketDataProvider = new MockMarketProvider()
