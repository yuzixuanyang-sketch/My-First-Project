import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 仅后端读取。不要把 APCA_API_* 改成 VITE_*，否则会被打包进浏览器。
function loadFile(name) {
  const path = resolve(process.cwd(), name)
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadFile('.env')
loadFile('.env.local')

const isProduction = process.argv.includes('--production')

export const config = {
  keyId: process.env.APCA_API_KEY_ID?.trim() || '',
  secretKey: process.env.APCA_API_SECRET_KEY?.trim() || '',
  // Render 会注入 PORT；本地开发仍可用 MARKET_API_PORT 覆盖，默认 8787。
  port: Number(process.env.PORT || process.env.MARKET_API_PORT || 8787),
  // 生产环境需监听所有网卡；本地开发保持仅本机可访问。
  host: isProduction ? '0.0.0.0' : '127.0.0.1',
}
