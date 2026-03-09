import { execSync } from 'node:child_process'

const ports = process.argv.slice(2).map((value) => Number.parseInt(value, 10)).filter((value) => Number.isInteger(value) && value > 0)

for (const port of ports) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

    if (!output) {
      console.log(`No process running on port ${port}.`)
      continue
    }

    const pids = [...new Set(output.split(/\s+/).filter(Boolean))]
    execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'ignore' })
    console.log(`Killed process on port ${port}: ${pids.join(', ')}`)
  } catch {
    console.log(`No process running on port ${port}.`)
  }
}
