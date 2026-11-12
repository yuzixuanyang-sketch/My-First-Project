// 浏览器端验收。需先启动开发服务器，并以 --remote-debugging-port=9222 启动 Chrome。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const APP_URL = 'http://127.0.0.1:5173/'
const STORAGE_KEY = 'us-stock-sim:account:v1'
const errors = []
const pending = new Map()
let nextId = 1

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const target = targets.find((item) => item.type === 'page')
if (!target) throw new Error('未找到 Chrome 页面目标')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id) {
    const handler = pending.get(message.id)
    if (!handler) return
    pending.delete(message.id)
    if (message.error) handler.reject(new Error(message.error.message))
    else handler.resolve(message.result)
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.text)
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '))
  }
})

function send(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  }
  return result.result.value
}

async function waitFor(expression, label) {
  const started = Date.now()
  while (Date.now() - started < 12000) {
    if (await evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`等待超时：${label}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log('ok -', message)
}

async function clickText(text) {
  const clicked = await evaluate(`(() => {
    const element = [...document.querySelectorAll('button, a')].find((node) => node.textContent.trim() === ${JSON.stringify(text)})
    if (!element) return false
    element.click()
    return true
  })()`)
  if (!clicked) throw new Error(`找不到可点击元素：${text}`)
}

async function fillQuantity(quantity) {
  await evaluate(`(() => {
    const input = document.querySelector('input[type="number"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(String(quantity))})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}

async function account() {
  return evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))`)
}

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = join(process.env.TEMP || '.', `us-stock-sim-${name}.png`)
  writeFileSync(file, Buffer.from(result.data, 'base64'))
  console.log('screenshot -', file)
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.navigate', { url: APP_URL })
  await waitFor(`document.readyState === 'complete' && document.querySelectorAll('a[href^="#/stock/"]').length === 9`, '九只行情卡片')
  assert(await evaluate(`document.body.innerText.includes('Alpaca IEX 实时行情') && document.body.innerText.includes('IEX · 非 SIP 全市场')`), '首页明确标注 Alpaca IEX 来源')
  assert(await evaluate(`document.body.innerText.includes('未配置 Alpaca API 密钥')`), '缺少密钥时显示数据不可用')
  assert(await evaluate(`document.querySelectorAll('a[href^="#/stock/"] svg').length === 0`), '真实数据不可用时不用随机走势冒充')
  await screenshot('real-unavailable')
  await clickText('模拟备用')
  await waitFor(`document.body.innerText.includes('本地模拟备用行情') && document.querySelectorAll('a[href^="#/stock/"] svg').length === 9`, '切换到模拟备用行情')
  await screenshot('home')

  await evaluate(`document.querySelector('a[href="#/stock/AAPL"]').click()`)
  await waitFor(`location.hash === '#/stock/AAPL' && document.querySelector('h1')?.textContent === '苹果'`, 'AAPL 详情页')
  await waitFor(`!!document.querySelector('.recharts-surface')`, '详情价格图表')
  assert(await evaluate(`[...document.querySelectorAll('button')].filter((b) => ['1日','1周','1月','3月','1年'].includes(b.textContent.trim())).length === 5`), '五种图表时间范围完整')
  await clickText('1月')
  assert(await evaluate(`!!document.querySelector('.recharts-surface')`), '切换时间范围后图表正常')
  await screenshot('detail')

  await clickText('买入')
  await waitFor(`!!document.querySelector('input[type="number"]')`, '买入窗口')
  await fillQuantity(10)
  await waitFor(`!([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '确认买入')?.disabled)`, '买入按钮可用')
  await clickText('确认买入')
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))?.trades?.length === 1`, '买入写入本地存储')
  const bought = await account()
  const buyTrade = bought.trades[0]
  assert(bought.positions.AAPL.qty === 10, '买入十股后持仓正确')
  assert(Math.abs(bought.cash - (100000 - buyTrade.amount)) < 1e-7, '买入后现金扣减正确')
  assert(Math.abs(bought.positions.AAPL.avgCost - buyTrade.price) < 1e-7, '首次买入平均成本正确')
  await clickText('完成')

  await send('Page.reload', { ignoreCache: true })
  await waitFor(`document.querySelector('h1')?.textContent === '苹果'`, '刷新后详情页恢复')
  const persistedBuy = await account()
  assert(persistedBuy.trades.length === 1 && persistedBuy.positions.AAPL.qty === 10, '刷新后买入记录与持仓保留')

  await clickText('卖出')
  await waitFor(`!!document.querySelector('input[type="number"]')`, '卖出窗口')
  await fillQuantity(4)
  await clickText('确认卖出')
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))?.trades?.length === 2`, '卖出写入本地存储')
  const sold = await account()
  const sellTrade = sold.trades[0]
  assert(sold.positions.AAPL.qty === 6, '卖出四股后剩余六股')
  assert(Math.abs(sold.cash - (bought.cash + sellTrade.amount)) < 1e-7, '卖出后现金增加正确')
  assert(Math.abs(sold.realizedPnl - (sellTrade.price - buyTrade.price) * 4) < 1e-7, '卖出已实现盈亏正确')
  await clickText('完成')

  await evaluate(`location.hash = '#/portfolio'`)
  await waitFor(`document.querySelector('h1')?.textContent === '我的资产'`, '资产页')
  assert(await evaluate(`document.body.innerText.includes('AAPL') && document.body.innerText.includes('平均成本')`), '资产页显示持仓成本和现价')
  await screenshot('portfolio')

  await evaluate(`location.hash = '#/trades'`)
  await waitFor(`document.querySelector('h1')?.textContent === '交易记录'`, '交易记录页')
  assert(await evaluate(`document.querySelectorAll('tbody tr').length === 2`), '交易记录显示两笔成交')
  assert(await evaluate(`document.body.innerText.includes('买入') && document.body.innerText.includes('卖出')`), '交易方向记录完整')

  await evaluate(`location.hash = '#/portfolio'`)
  await waitFor(`document.querySelector('h1')?.textContent === '我的资产'`, '返回资产页')
  await clickText('重置模拟账户')
  await waitFor(`!!document.querySelector('#reset-title')`, '重置二次确认窗口')
  assert((await account()).trades.length === 2, '二次确认前不会清空账户')
  await clickText('确认重置')
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))?.trades?.length === 0`, '重置写入本地存储')
  const reset = await account()
  assert(reset.cash === 100000 && Object.keys(reset.positions).length === 0 && reset.realizedPnl === 0, '重置恢复初始资金并清空持仓和盈亏')

  await send('Page.reload', { ignoreCache: true })
  await waitFor(`document.querySelector('h1')?.textContent === '我的资产'`, '重置后刷新')
  assert((await account()).trades.length === 0 && (await account()).cash === 100000, '重置结果刷新后保留')

  await clickText('IEX 实时')
  await waitFor(`document.body.innerText.includes('未配置 Alpaca API 密钥')`, '切换回真实模式')
  assert(await evaluate(`localStorage.getItem('us-stock-sim:market-mode:v1') === 'real'`), '真实模式选择持久保存')

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await evaluate(`location.hash = '#/'`)
  await waitFor(`document.querySelectorAll('a[href^="#/stock/"]').length === 9`, '移动端行情页')
  assert(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), '移动端行情页无横向溢出')
  await screenshot('mobile')
  assert(errors.length === 0, `浏览器无运行错误${errors.length ? `：${errors.join('; ')}` : ''}`)

  console.log('\n浏览器端核心流程全部通过')
} finally {
  ws.close()
}
