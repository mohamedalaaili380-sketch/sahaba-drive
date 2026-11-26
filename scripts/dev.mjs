import { spawn } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const children = [
  spawn(process.execPath, ['server/index.mjs'], { cwd: root, stdio: 'inherit', shell: false }),
  spawn(npm, ['run', 'web'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }),
]

function stop() {
  for (const child of children) child.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const child of children) child.on('exit', (code) => { if (code) { console.error(`Child process exited with code ${code}`); stop() } })
