/* oxlint-disable react/only-export-components -- Provider 与同模块 Hook 是内聚的公开 API */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyBuy,
  applySell,
  createInitialAccount,
  type AccountState,
  type TradeResult,
} from './account'

const STORAGE_KEY = 'us-stock-sim:account:v1'

interface AccountContextValue {
  account: AccountState
  buy: (symbol: string, name: string, price: number, qty: number) => TradeResult
  sell: (symbol: string, name: string, price: number, qty: number) => TradeResult
  reset: () => void
}

const AccountContext = createContext<AccountContextValue | null>(null)

function loadAccount(): AccountState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialAccount()
    const parsed = JSON.parse(raw) as AccountState
    if (typeof parsed.cash !== 'number' || !parsed.positions || !Array.isArray(parsed.trades)) {
      return createInitialAccount()
    }
    return { ...parsed, realizedPnl: parsed.realizedPnl ?? 0 }
  } catch {
    return createInitialAccount()
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountState>(loadAccount)

  // 任何账户变化都写入 LocalStorage，刷新后数据不丢失
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(account))
    } catch {
      // 存储失败（如隐私模式）时静默忽略，页面内状态仍可用
    }
  }, [account])

  const buy = useCallback(
    (symbol: string, name: string, price: number, qty: number): TradeResult => {
      const result = applyBuy(account, symbol, name, price, qty)
      if (result.ok && result.state) setAccount(result.state)
      return result
    },
    [account],
  )

  const sell = useCallback(
    (symbol: string, name: string, price: number, qty: number): TradeResult => {
      const result = applySell(account, symbol, name, price, qty)
      if (result.ok && result.state) setAccount(result.state)
      return result
    },
    [account],
  )

  const reset = useCallback(() => setAccount(createInitialAccount()), [])

  const value = useMemo(
    () => ({ account, buy, sell, reset }),
    [account, buy, sell, reset],
  )
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccount must be used within AccountProvider')
  return ctx
}
