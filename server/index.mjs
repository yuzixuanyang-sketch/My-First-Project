import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { config } from './env.mjs'
import { alpacaService } from './alpaca.mjs'
import { MarketWebSocketHub } from './webSocketHub.mjs'

const hub = new MarketWebSocketHub()

function sendJson(response, status, data, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  response.end(JSON.stringify(data))
}

function sendError(response, error) {
  const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 502
  sendJson(response, status, {
    error: {
      code: error?.code ?? 'MARKET_SERVICE_ERROR',
      message: error?.message ?? '行情服务异常',
      retryAfter: error?.retryAfter,
    },
  })
}

async function handleApi(request, response, url) {
  if (url.pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      configured: alpacaService.configured,
      provider: 'Alpaca',
      feed: 'IEX',
      status: alpacaService.getStatus(),
      trading: 'simulated-only',
    })
    return
  }

  if (url.pathname === '/api/market/bootstrap') {
    try {
      const data = await alpacaService.getBootstrap()
      sendJson(response, 200, data)
    } catch (error) {
      sendError(response, error)
    }
    return
  }

  if (url.pathname === '/api/market/bars') {
    try {
      const data = await alpacaService.getHistory(
        url.searchParams.get('symbol') ?? '',
        url.searchParams.get('range') ?? '1D',
      )
      sendJson(response, 200, data)
    } catch (error) {
      sendError(response, error)
    }
    return
  }

  if (url.pathname === '/api/market/status') {
    sendJson(response, 200, {
      source: alpacaService.getSourceInfo(),
      status: alpacaService.getStatus(),
      configured: alpacaService.configured,
    })
    return
  }

  sendJson(response, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
}

function serveStatic(response, pathname) {
  const distDir = resolve(process.cwd(), 'dist')
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1)
  const target = normalize(join(distDir, relative))
  if (!target.startsWith(distDir) || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not Found')
    return
  }
  response.writeHead(200, {
    'content-type': MIME[extname(target)] ?? 'application/octet-stream',
    'cache-control': extname(target) === '.html' ? 'no-store' : 'public, max-age=3600',
  })
  response.end(readFileSync(target))
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname.startsWith('/api/')) {
    handleApi(request, response, url)
    return
  }
  if (process.argv.includes('--production')) {
    serveStatic(response, url.pathname)
    return
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Market data service is running. Start the Vite client for the UI.')
})

server.on('upgrade', (request, socket, head) => {
  hub.upgrade(request, socket, head, (send) => {
    send({
      type: 'status',
      status: alpacaService.getStatus(),
      source: alpacaService.getSourceInfo(),
      configured: alpacaService.configured,
    })
  })
})

alpacaService.startStream(
  (event) => hub.broadcast(event),
  (status) => hub.broadcast({ type: 'status', status, source: alpacaService.getSourceInfo() }),
)

server.listen(config.port, '127.0.0.1', () => {
  const safeStatus = {
    configured: alpacaService.configured,
    provider: 'Alpaca',
    feed: 'IEX',
    port: config.port,
  }
  console.log('[market-service]', JSON.stringify(safeStatus))
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    alpacaService.stopStream()
    server.close(() => process.exit(0))
    process.exit(0)
  })
}
