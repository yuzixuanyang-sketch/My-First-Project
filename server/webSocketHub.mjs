import { createHash } from 'node:crypto'

// 原生 RFC6455 文本帧服务，仅向浏览器推送行情，不接收任何交易指令。
export class MarketWebSocketHub {
  clients = new Set()

  upgrade(request, socket, head, onConnect) {
    if (new URL(request.url, 'http://localhost').pathname !== '/api/market/stream') return false
    const key = request.headers['sec-websocket-key']
    if (!key) {
      socket.destroy()
      return true
    }
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'))
    socket.setNoDelay(true)
    this.clients.add(socket)
    const remove = () => this.clients.delete(socket)
    socket.on('close', remove)
    socket.on('error', remove)
    socket.on('end', remove)
    socket.on('data', (chunk) => this.handleData(socket, chunk))
    if (head?.length) this.handleData(socket, head)
    onConnect((message) => this.send(socket, message))
    return true
  }

  handleData(socket, chunk) {
    // 浏览器可能发送 close/ping/pong；无需解析文本消息。
    if (chunk.length >= 2 && (chunk[0] & 0x0f) === 0x8) socket.end()
  }

  send(socket, message) {
    if (socket.destroyed || !socket.writable) return
    const payload = Buffer.from(JSON.stringify(message))
    let header
    if (payload.length < 126) {
      header = Buffer.from([0x81, payload.length])
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4)
      header[0] = 0x81
      header[1] = 126
      header.writeUInt16BE(payload.length, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x81
      header[1] = 127
      header.writeBigUInt64BE(BigInt(payload.length), 2)
    }
    socket.write(Buffer.concat([header, payload]))
  }

  broadcast(message) {
    for (const client of this.clients) this.send(client, message)
  }
}
