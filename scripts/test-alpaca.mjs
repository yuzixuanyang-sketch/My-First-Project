// Alpaca IEX 真实行情验证。先启动 npm run dev 或 dev:server。
// 默认等待 45 秒的实时 WebSocket 事件；非交易活跃时段可用第二参数缩短等待。
const base = process.env.MARKET_API_TEST_URL || 'http://127.0.0.1:8787'
const waitMs = Number(process.argv[2] || 45000)

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log('ok -', message)
}

async function getJson(path) {
  const response = await fetch(`${base}${path}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(`FAIL: ${path} 返回 ${response.status}：${body?.error?.message ?? '未知错误'}`)
  }
  return body
}

const health = await getJson('/api/health')
assert(health.ok === true, '行情后端运行正常')
if (!health.configured) {
  throw new Error('请先复制 .env.example 为 .env.local，填写 APCA_API_KEY_ID 和 APCA_API_SECRET_KEY 后重启 npm run dev')
}
assert(health.configured === true, '已配置 Alpaca API 密钥（密钥本身不输出）')
assert(health.provider === 'Alpaca' && health.feed === 'IEX', '数据提供商标识为 Alpaca IEX')
assert(health.trading === 'simulated-only', '交易能力仍为模拟-only，未接入真实下单')

const bootstrap = await getJson('/api/market/bootstrap')
assert(bootstrap.source.provider === 'Alpaca', 'REST 返回来源为 Alpaca')
assert(bootstrap.source.feed === 'IEX' && bootstrap.source.isSimulated === false, 'REST 返回真实 IEX 数据而非模拟数据')
assert(bootstrap.source.description.includes('不是全市场 SIP'), '明确标注 IEX 不是全市场 SIP 行情')

const quoteEntries = Object.values(bootstrap.quotes ?? {})
assert(quoteEntries.length > 0, '最新报价/成交接口返回有效报价')
assert(
  quoteEntries.every((quote) => Number.isFinite(quote.price) && quote.price > 0),
  '全部价格为正数且非随机空值',
)
assert(
  quoteEntries.every((quote) => quote.source === 'IEX' && Number.isFinite(quote.updatedAt)),
  '报价带有 IEX 来源和真实数据时间戳',
)

const sample = quoteEntries.find((quote) => quote.exchange) ?? quoteEntries[0]
console.log(
  `sample - ${sample.symbol} price=${sample.price.toFixed(2)} exchange=${sample.exchange ?? 'unknown'} updatedAt=${new Date(sample.updatedAt).toISOString()}`,
)

const socket = new WebSocket(base.replace(/^http/, 'ws') + '/api/market/stream')
let streamConnected = false
let streamQuote = null

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.type === 'status') {
    if (message.status.state === 'connected') streamConnected = true
    return
  }
  if (message.type === 'quote' && !streamQuote) {
    streamQuote = message.quote
    console.log(
      `stream - ${message.quote.symbol} price=${message.quote.price.toFixed(2)} updatedAt=${new Date(message.quote.updatedAt).toISOString()}`,
    )
  }
})

const opened = await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
  setTimeout(() => reject(new Error('本地行情 WebSocket 连接超时')), 10000)
})
assert(Boolean(opened), '本地行情 WebSocket 已连接')

const started = Date.now()
while (Date.now() - started < waitMs && !(streamConnected && streamQuote)) {
  await new Promise((resolve) => setTimeout(resolve, 250))
}
socket.close()

assert(streamConnected, 'Alpaca IEX WebSocket 已认证并订阅成功')
assert(Boolean(streamQuote), `等待 ${Math.round(waitMs / 1000)} 秒内收到真实 IEX 实时推送事件`)
assert(
  Number.isFinite(streamQuote.price) && streamQuote.price > 0 && streamQuote.source === 'IEX',
  '实时推送价格为有效 IEX 数据',
)
console.log('\nAlpaca IEX 真实行情验证通过')
