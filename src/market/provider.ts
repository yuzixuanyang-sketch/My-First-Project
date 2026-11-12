import type { IMarketDataProvider } from './simulator'
import { mockMarketProvider } from './simulator'
import { AlpacaMarketProvider } from './alpacaProvider'
import type { MarketMode, MarketStatus, PricePoint, Quote, RangeKey, StockMeta } from '../types'

const MODE_KEY = 'us-stock-sim:market-mode:v1'
const MOCK_SOURCE: MarketStatus['source'] = {
  provider: 'Local Simulator',
  feed: 'SIMULATION',
  isSimulated: true,
  description: '本地模拟备用行情，非真实市场报价',
}

function readMode(): MarketMode {
  try {
    const value = localStorage.getItem(MODE_KEY)
    return value === 'simulation' ? 'simulation' : 'real'
  } catch {
    return 'real'
  }
}

function writeMode(mode: MarketMode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // 本地存储不可用时仍保持当前页面内模式可用
  }
}

/**
 * 行情模式协调层：
 * real = Alpaca IEX 真实行情；simulation = 本地模拟备用（仅显式切换）。
 * 模拟交易引擎与账户数据完全不受行情模式影响。
 */
class HybridMarketProvider implements IMarketDataProvider {
  readonly real = new AlpacaMarketProvider()
  readonly mock = mockMarketProvider

  private mode: MarketMode = readMode()
  private listeners = new Set<() => void>()
  private version = 0

  constructor() {
    this.real.subscribe(() => this.handleUpdate('real'))
    this.mock.subscribe(() => this.handleUpdate('simulation'))
  }

  private active(): IMarketDataProvider {
    return this.mode === 'simulation' ? this.mock : this.real
  }

  private handleUpdate(source: MarketMode) {
    if (source !== this.mode) return
    this.version++
    this.listeners.forEach((listener) => listener())
  }

  get isSimulated(): boolean {
    return this.mode === 'simulation'
  }

  getMode(): MarketMode {
    return this.mode
  }

  setMode(mode: MarketMode): void {
    if (mode === this.mode) return
    this.active().stop()
    this.mode = mode
    writeMode(mode)
    this.version++
    this.listeners.forEach((listener) => listener())
    this.active().start()
  }

  getMetas(): StockMeta[] {
    return this.active().getMetas()
  }

  getQuote(symbol: string): Quote | undefined {
    return this.active().getQuote(symbol)
  }

  getQuotes(): Quote[] {
    return this.active().getQuotes()
  }

  getHistory(symbol: string, range: RangeKey): PricePoint[] {
    return this.active().getHistory(symbol, range)
  }

  async loadHistory(symbol: string, range: RangeKey): Promise<PricePoint[]> {
    const active = this.active()
    if (active instanceof AlpacaMarketProvider) return active.loadHistory(symbol, range)
    return active.getHistory(symbol, range)
  }

  getStatus(): MarketStatus {
    if (this.mode === 'simulation') {
      return {
        state: 'connected',
        code: null,
        message: '本地模拟备用行情运行中',
        source: MOCK_SOURCE,
        updatedAt: Date.now(),
        nextRetryAt: null,
      }
    }
    return this.real.getStatus()
  }

  retry(): void {
    if (this.mode === 'simulation') return
    this.real.retry()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion(): number {
    return this.version
  }

  start(): void {
    this.active().start()
  }

  stop(): void {
    this.active().stop()
  }
}

export const marketProvider = new HybridMarketProvider()
