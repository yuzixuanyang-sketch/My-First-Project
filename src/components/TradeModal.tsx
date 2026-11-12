import { useMemo, useState } from 'react'
import { useAccount } from '../store/AccountContext'
import { useMarket } from '../market/MarketContext'
import { fmtUSD } from '../utils/format'

interface Props {
  symbol: string
  name: string
  side: 'BUY' | 'SELL'
  onClose: () => void
}

/** 买入 / 卖出弹窗：实时报价成交，含资金与持仓校验 */
export default function TradeModal({ symbol, name, side, onClose }: Props) {
  const { account, buy, sell } = useAccount()
  const { quotes, isSimulated } = useMarket()
  const quote = quotes.get(symbol)
  const price = quote?.price ?? 0
  const position = account.positions[symbol]

  const [qtyText, setQtyText] = useState('')
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{ price: number; amount: number; qty: number } | null>(null)

  const qty = useMemo(() => {
    const n = Number(qtyText)
    return Number.isInteger(n) && n > 0 ? n : 0
  }, [qtyText])
  const amount = qty * price

  const isBuy = side === 'BUY'
  const cashAfter = isBuy ? account.cash - amount : account.cash + amount
  const insufficientFunds = isBuy && qty > 0 && amount > account.cash + 1e-9
  const insufficientQty = !isBuy && qty > (position?.qty ?? 0)
  const insufficientData = !quote || quote.price <= 0

  function handleSubmit() {
    if (qty <= 0) {
      setError('请输入有效的正整数数量')
      return
    }
    const executionPrice = price
    const result = isBuy
      ? buy(symbol, name, executionPrice, qty)
      : sell(symbol, name, executionPrice, qty)
    if (!result.ok) {
      setError(result.error ?? '交易失败')
      return
    }
    setReceipt({ price: executionPrice, amount: executionPrice * qty, qty })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-t-xl border border-term-border bg-term-panel p-5 sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-label={`${isBuy ? '买入' : '卖出'}${name}模拟交易`}
        onClick={(e) => e.stopPropagation()}
      >
        {receipt ? (
          <div className="py-6 text-center" role="status">
            <div className={`text-lg font-semibold ${isBuy ? 'text-term-up' : 'text-term-down'}`}>
              {isBuy ? '买入' : '卖出'}委托已成交（模拟）
            </div>
            <div className="mt-3 text-sm text-term-muted">
              {name}（{symbol}） {receipt.qty} 股 × {fmtUSD(receipt.price)} = {fmtUSD(receipt.amount)}
            </div>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-md bg-term-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              完成
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <span
                  className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${
                    isBuy ? 'bg-term-up/15 text-term-up' : 'bg-term-down/15 text-term-down'
                  }`}
                >
                  {isBuy ? '买入' : '卖出'}
                </span>
                <span className="font-semibold text-white">{name}</span>
                <span className="ml-1 text-sm text-term-muted">{symbol}</span>
              </div>
              <button onClick={onClose} aria-label="关闭交易窗口" className="text-term-muted hover:text-white">
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-md border border-term-border bg-term-panel2 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-term-muted">
                  {isSimulated ? '当前模拟价格' : '当前 IEX 成交价'}
                </span>
                <span className="num text-white">{fmtUSD(price)}</span>
              </div>
              <div className="mt-1.5 flex justify-between">
                <span className="text-term-muted">{isBuy ? '可用资金' : '当前持仓'}</span>
                <span className="num">
                  {isBuy ? fmtUSD(account.cash) : `${position?.qty ?? 0} 股`}
                </span>
              </div>
            </div>

            <label className="mt-4 block text-sm text-term-muted">
              数量（股，仅支持整数）
              <input
                type="number"
                min={1}
                step={1}
                value={qtyText}
                onChange={(e) => {
                  setQtyText(e.target.value)
                  setError('')
                }}
                placeholder="输入股数"
                className="num mt-1.5 w-full rounded-md border border-term-border bg-term-bg px-3 py-2 text-white outline-none focus:border-term-accent"
                autoFocus
              />
            </label>

            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-term-muted">预计交易金额</span>
                <span className="num text-white">{fmtUSD(amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-term-muted">交易后可用资金</span>
                <span className={`num ${cashAfter < -1e-9 ? 'text-term-down' : ''}`}>
                  {qty > 0 ? fmtUSD(cashAfter) : '—'}
                </span>
              </div>
            </div>

            {(error || insufficientFunds || insufficientQty) && (
              <div className="mt-3 rounded-md border border-term-down/40 bg-term-down/10 px-3 py-2 text-sm text-term-down">
                {error ||
                  (insufficientFunds
                    ? '可用资金不足，无法完成买入'
                    : '持仓数量不足，无法完成卖出')}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={qty <= 0 || insufficientData || insufficientFunds || insufficientQty}
              className={`mt-4 w-full rounded-md px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                isBuy ? 'bg-term-up hover:brightness-110' : 'bg-term-down hover:brightness-110'
              }`}
            >
              确认{isBuy ? '买入' : '卖出'}
            </button>
            <div className="mt-2 text-center text-[11px] text-term-muted">
              模拟交易以{isSimulated ? '当前模拟价格' : '当前 IEX 价格'}即时成交，仅使用虚拟资金，不涉及真实下单
            </div>
          </>
        )}
      </div>
    </div>
  )
}
