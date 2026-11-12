# 美股模拟交易平台

面向个人投资学习者的本地美股模拟交易网站。第一阶段已接入 **Alpaca Market Data API 免费版的 IEX 实时行情**，用于行情展示和虚拟资金模拟成交。平台不调用 Alpaca 下单接口，不使用券商账户资金，不涉及真实交易。

当前行情有两种模式：

- **IEX 实时（默认）**：来自 Alpaca 的真实 IEX 数据。IEX 是单一交易所数据，**不是全市场 SIP 行情**。
- **模拟备用**：原有本地模拟行情。只有用户在页面中显式切换时才会启用；真实接口失败时不会自动用随机数冒充真实行情。

## 技术栈

- Vite + React + TypeScript
- Tailwind CSS 4、Recharts、React Router
- Node.js 原生 HTTP 服务（本地行情代理，密钥仅保存在后端）
- Node.js 22 原生 WebSocket 客户端连接 Alpaca IEX
- 原生 RFC6455 WebSocket 推送前端，无需暴露 Alpaca 地址和密钥
- LocalStorage 保存账户、持仓和交易记录

## 快速启动

使用 Node.js 22.12 或更高版本。

```bash
cd us-stock-sim
npm install
cp .env.example .env.local
# 编辑 .env.local，填入 Alpaca API Key
npm run dev
```

打开：

```text
http://127.0.0.1:5173
```

`npm run dev` 会同时启动：

- Vite 前端：`http://127.0.0.1:5173`
- 行情后端：`http://127.0.0.1:8787`

生产模式：

```bash
npm run build
npm run start
```

然后访问 `http://127.0.0.1:8787`。

## Alpaca 免费行情注册与配置

1. 打开 [https://app.alpaca.markets/signup](https://app.alpaca.markets/signup)，使用邮箱注册。可以创建 **Paper Only Account**，无需入金。
2. 登录 Alpaca Dashboard，进入 Paper Trading / API Keys 页面。
3. 生成 API Key，得到：
   - `APCA_API_KEY_ID`
   - `APCA_API_SECRET_KEY`
4. 将两个值写入项目根目录的 `.env.local`：

```bash
APCA_API_KEY_ID=your_alpaca_key_id
APCA_API_SECRET_KEY=your_alpaca_secret_key
MARKET_API_PORT=8787
```

5. 重启：

```bash
npm run dev
```

安全要求：

- `.env.local` 已被 `.gitignore` 忽略，不要提交。
- 不要把变量改成 `VITE_APCA_API_KEY_ID`，否则会被打包进浏览器。
- 密钥只在 `server/` 后端进程读取；浏览器只访问本项目 `/api/market/*` 代理接口。

Alpaca 免费计划的行情要点：

- 实时 WebSocket 数据来自 IEX。
- REST API 约 200 次请求/分钟。
- WebSocket 订阅最多 30 个 symbol。
- 本项目订阅 9 个 symbol，在免费计划限制内。
- IEX 只覆盖 IEX 交易所发生的成交和报价，不等同于覆盖全部美国交易所的 SIP 数据。

## 行情数据架构

```text
浏览器 React UI
   │  /api/market/bootstrap      最新成交、最新买卖报价、日线摘要、迷你走势
   │  /api/market/bars           1D / 1W / 1M / 3M / 1Y 历史 K 线
   │  /api/market/stream         本地 WebSocket 推送
   ▼
本地行情代理 server/
   │  REST  data.alpaca.markets/v2/stocks/...    feed=iex
   │  WS    wss://stream.data.alpaca.markets/v2/iex
   ▼
Alpaca Market Data API（IEX）
```

### 后端模块

```text
server/
├── env.mjs              # 仅后端读取 .env / .env.local
├── alpaca.mjs           # Alpaca REST、IEX WebSocket、缓存、限流与重连
├── webSocketHub.mjs     # 原生 WebSocket 推送浏览器
├── index.mjs            # API 路由、静态文件和进程生命周期
└── dev.mjs              # 同时启动行情后端和 Vite 前端
```

### 前端模块

```text
src/
├── market/
│   ├── alpacaProvider.ts    # 真实 IEX 行情 Provider
│   ├── simulator.ts         # 本地模拟备用 Provider
│   ├── provider.ts          # 双模式协调层和状态
│   └── MarketContext.tsx    # React 行情订阅
├── components/
│   ├── MarketStatusBar.tsx  # 来源、更新时间、非 SIP 标识、连接状态、模式切换
│   ├── PriceChart.tsx
│   ├── Sparkline.tsx
│   ├── TradeModal.tsx
│   └── Layout.tsx
├── pages/                   # 行情、详情、资产、交易记录
├── store/                   # 虚拟资金交易引擎和 LocalStorage
└── types.ts                 # 行情与状态类型
```

### REST 端点

- `GET /api/health`：服务状态、是否已配置密钥、Provider 和 Feed。
- `GET /api/market/bootstrap`：Alpaca IEX 最新 trades/quotes、日线摘要和最近 7 个日线收盘点。
- `GET /api/market/bars?symbol=AAPL&range=1D`：历史 K 线，全部使用 `feed=iex`。
- `GET /api/market/status`：上游连接状态。
- `ws://127.0.0.1:5173/api/market/stream`：前端通过 Vite 代理连接后端。

### 使用的 Alpaca REST 接口

- `GET /v2/stocks/trades/latest?feed=iex`
- `GET /v2/stocks/quotes/latest?feed=iex`
- `GET /v2/stocks/bars?feed=iex`

后端只调用行情读取接口，没有接入任何 `/v2/orders` 或真实下单接口。

### WebSocket 事件

后端连接并认证：

```json
{"action":"auth","key":"...","secret":"..."}
```

认证成功后订阅：

```json
{"action":"subscribe","trades":["AAPL","MSFT"],"quotes":["AAPL","MSFT"],"bars":["AAPL","MSFT"]}
```

实际订阅包含全部 9 个 symbol。后端将 trade、quote、bar 归一化后推送给浏览器，前端据此更新价格、买一/卖一、成交量、最高价、最低价和图表。

## 异常与降级

- **未配置密钥**：IEX 模式显示“未配置 Alpaca API 密钥”，股票卡片显示数据不可用，不生成假价格。
- **网络断开**：前端与后端 WebSocket 自动指数退避重连。
- **Alpaca 连接断开**：后端自动重连并广播“重连中”。
- **API 限流 429**：显示明确错误，读取并展示 `Retry-After`；后端对 bootstrap 和历史 K 线做短期缓存。
- **超时/5xx/401/403**：显示具体错误代码，可点击“重试连接”。
- **模拟备用**：可在顶部手动切换。切回真实模式时重新连接；模拟模式始终明确显示“非真实市场报价”。

账户存储键仍是 `us-stock-sim:account:v1`，行情模式存储在 `us-stock-sim:market-mode:v1`。升级不会影响原有现金、持仓、交易记录和重置功能。

## 已实现功能

- 行情首页：AAPL、MSFT、NVDA、AMZN、GOOGL、TSLA、META、SPY、QQQ。
- 详情页：最新成交价、IEX 买/卖价、开高低、成交量、历史 K 线和时间范围。
- 模拟交易：整数股、资金/持仓校验、预计金额、成交回执；仍只用虚拟资金。
- 我的资产：总资产、现金、持仓市值、总盈亏、总收益率、已实现/未实现盈亏。
- 交易记录：时间、方向、成交价、数量、金额。
- 数据来源状态条：Alpaca / IEX / 非 SIP、更新时间、连接状态、错误和模式切换。
- 持久化与重置：刷新不丢账户数据；重置需二次确认。

## 计算规则

不计手续费、税费、融资、做空和期权，仅支持整数股。

- 买入平均成本 = `(原平均成本 × 原数量 + 买入价 × 买入数量) ÷ 买入后总数量`
- 卖出已实现盈亏 = `(卖出价 - 平均成本) × 卖出数量`；剩余持仓平均成本不变
- 持仓市值 = `当前价格 × 持有数量`
- 未实现盈亏 = `(当前价格 - 平均成本) × 持有数量`
- 总资产 = `可用现金 + 全部持仓市值`
- 总盈亏 = `总资产 - 100,000 = 已实现盈亏 + 未实现盈亏`
- 总收益率 = `总盈亏 ÷ 100,000`

真实 IEX 行情不可用时，持仓页会提示“暂以成本估值”，不会用随机价冒充现价。

## 测试与验证

### 常规测试

```bash
npm test        # 虚拟交易引擎 + 本地模拟 Provider
npm run lint
npm run build
```

### 浏览器回归

先启动 `npm run dev`，再启动 Chrome 远程调试端口 9222，然后：

```bash
npm run test:browser
```

覆盖：真实不可用状态、模拟备用切换、九只标的、图表、买入、刷新、卖出、资产、交易记录、二次确认重置、模式持久化和移动端布局。

### 验证行情确实来自 Alpaca IEX

1. 启动：

```bash
npm run dev
```

2. 打开 `http://127.0.0.1:5173`，顶部应显示：

```text
Alpaca IEX 实时行情
IEX · 非 SIP 全市场
已连接
```

3. 查看后端健康状态：

```bash
curl http://127.0.0.1:8787/api/health
```

应包含：

```json
{"configured":true,"provider":"Alpaca","feed":"IEX"}
```

4. 运行真实行情验证：

```bash
npm run test:alpaca
```

脚本默认等待 45 秒实时事件，会检查：

- REST 来源为 Alpaca 且 `feed=IEX`
- 报价带有真实 IEX 数据时间戳和交易所代码
- WebSocket 已认证并订阅成功
- WebSocket 收到真实 IEX 推送事件

如果提示等待时间内没有实时推送，通常说明当前不在 IEX 活跃交易时段；可在美股交易时段重跑。脚本不会输出或保存密钥。

也可以直接检查一次 REST 数据：

```bash
curl "http://127.0.0.1:8787/api/market/bootstrap"
```

返回的每个报价包含 `source: "IEX"`、`updatedAt`，部分成交还包含 IEX 交易所代码 `exchange`。这些值来自 Alpaca IEX 接口，不是本地随机生成。

## 数据边界

- 所有页面明确显示当前数据来源。
- IEX 不是全市场 SIP 行情，价格和成交量可能与全市场汇总报价不同。
- IEX 免费数据用于学习演示；生产或全市场研究需要用户自行评估并遵守 Alpaca 条款。
- 模拟交易不调用真实券商下单接口，不涉及真实资金。
