import { spawn } from 'node:child_process'

const children = []

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  child.on('exit', (code) => {
    console.log(`[dev] ${name} exited: ${code ?? 'signal'}`)
    shutdown(code === 0 ? 0 : code ?? 1)
  })
  children.push(child)
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

start('market-service', process.execPath, ['server/index.mjs'])
start('vite-client', process.execPath, [
  'node_modules/vite/bin/vite.js',
  '--host',
  '127.0.0.1',
  '--port',
  '5173',
  '--strictPort',
])
