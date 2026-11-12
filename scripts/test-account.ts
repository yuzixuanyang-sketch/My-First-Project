// 交易引擎自测：验证资金、持仓、交易记录与盈亏计算
import {
  applyBuy,
  applySell,
  createInitialAccount,
  summarize,
  INITIAL_CASH,
} from '../src/store/account.ts'

let s = createInitialAccount()
const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error('FAIL: ' + msg)
  console.log('ok -', msg)
}

assert(s.cash === INITIAL_CASH, '初始资金为 $100,000')

// 买入 10 股 AAPL @ 200
let r = applyBuy(s, 'AAPL', '苹果', 200, 10)
assert(r.ok && r.state!.cash === 98000, '买入后现金 = 98000')
s = r.state!
assert(s.positions.AAPL.qty === 10 && s.positions.AAPL.avgCost === 200, '持仓 10 股，成本 200')

// 再买 10 股 @ 220 → 平均成本 210
r = applyBuy(s, 'AAPL', '苹果', 220, 10)
assert(r.ok, '第二次买入成功')
s = r.state!
assert(Math.abs(s.positions.AAPL.avgCost - 210) < 1e-9, '加权平均成本 = 210')
assert(s.cash === 95800, '现金 = 95800')

// 资金不足校验
r = applyBuy(s, 'MSFT', '微软', 1000000, 100)
assert(!r.ok, '资金不足时买入被拒绝')

// 非整数校验
r = applyBuy(s, 'MSFT', '微软', 100, 1.5)
assert(!r.ok, '非整数股被拒绝')

// 卖出 5 股 @ 240 → 已实现盈亏 (240-210)*5 = 150
r = applySell(s, 'AAPL', '苹果', 240, 5)
assert(r.ok, '卖出成功')
s = r.state!
assert(s.cash === 97000, '卖出后现金 = 97000')
assert(s.positions.AAPL.qty === 15, '剩余 15 股')
assert(Math.abs(s.realizedPnl - 150) < 1e-9, '已实现盈亏 = +150')

// 持仓不足校验
r = applySell(s, 'AAPL', '苹果', 240, 999)
assert(!r.ok, '持仓不足时卖出被拒绝')

// 全卖后持仓被移除
r = applySell(s, 'AAPL', '苹果', 240, 15)
assert(r.ok, '清仓成功')
s = r.state!
assert(!s.positions.AAPL, '清仓后持仓记录被移除')
assert(Math.abs(s.realizedPnl - 600) < 1e-9, '累计已实现盈亏 = +600')

// 汇总计算：现金 100600 + 无持仓 → 总资产 = 100600，收益率 0.6%
const quotes = new Map()
const sum = summarize(s, quotes, (x) => x)
assert(Math.abs(sum.totalAssets - 100600) < 1e-9, '总资产 = 100600')
assert(Math.abs(sum.totalPnl - 600) < 1e-9, '总盈亏 = +600')
assert(Math.abs(sum.totalReturnPct - 0.006) < 1e-9, '总收益率 = 0.6%')

// 未实现盈亏场景：买 10 股 @100，现价 120
r = applyBuy(createInitialAccount(), 'NVDA', '英伟达', 100, 10)
const s2 = r.state!
const sum2 = summarize(s2, new Map([['NVDA', { price: 120 } as never]]), (x) => x)
assert(Math.abs(sum2.unrealizedPnl - 200) < 1e-9, '未实现盈亏 = +200')
assert(sum2.realizedPnl === 0, '无卖出时已实现盈亏 = 0')
assert(Math.abs(sum2.totalAssets - (100000 - 1000 + 1200)) < 1e-9, '总资产含浮盈 = 100200')
assert(Math.abs(sum2.totalPnl - sum2.realizedPnl - sum2.unrealizedPnl) < 1e-9, '总盈亏 = 已实现盈亏 + 未实现盈亏')
assert(s2.trades.length === 1 && s2.trades[0].side === 'BUY' && s2.trades[0].amount === 1000, '买入生成正确交易记录')
assert(createInitialAccount().cash === INITIAL_CASH, '重置数据恢复初始现金')

// 非法报价与数量必须被拒绝，且不能修改原账户
r = applyBuy(s2, 'NVDA', '英伟达', 0, 1)
assert(!r.ok, '零价格买入被拒绝')
r = applyBuy(s2, 'NVDA', '英伟达', Number.NaN, 1)
assert(!r.ok, '非有限价格买入被拒绝')
r = applySell(s2, 'NVDA', '英伟达', 100, -1)
assert(!r.ok, '负数卖出数量被拒绝')
assert(s2.cash === 99000 && s2.positions.NVDA.qty === 10, '失败交易不修改现金和持仓')

// 亏损卖出：已实现盈亏为负，现金仍按成交额增加
r = applySell(s2, 'NVDA', '英伟达', 80, 10)
assert(r.ok, '亏损卖出允许成交')
assert(Math.abs(r.state!.realizedPnl + 200) < 1e-9, '亏损卖出已实现盈亏 = -200')
assert(r.state!.cash === 99800, '亏损卖出后现金 = 99800')
assert(r.state!.trades[0].side === 'SELL' && r.state!.trades.length === 2, '卖出生成正确交易记录')

console.log('\n交易引擎全部断言通过')
