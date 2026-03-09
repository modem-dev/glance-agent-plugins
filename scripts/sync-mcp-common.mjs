import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const sourcePath = path.join(repoRoot, "common", "mcp", "glance-mcp.js")

const targets = [
  path.join(repoRoot, "claude", "common", "mcp", "glance-mcp.js"),
  path.join(repoRoot, "codex", "common", "mcp", "glance-mcp.js"),
]

const mode = process.argv.includes("--check") ? "check" : "sync"

const source = readFileSync(sourcePath, "utf8")

let mismatch = false

for (const targetPath of targets) {
  if (mode === "sync") {
    mkdirSync(path.dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, source)
    process.stdout.write(`synced ${path.relative(repoRoot, targetPath)}\n`)
    continue
  }

  if (!existsSync(targetPath)) {
    process.stderr.write(`missing ${path.relative(repoRoot, targetPath)}\n`)
    mismatch = true
    continue
  }

  const target = readFileSync(targetPath, "utf8")

  if (target !== source) {
    process.stderr.write(`out of sync ${path.relative(repoRoot, targetPath)}\n`)
    mismatch = true
  }
}

if (mode === "check" && mismatch) {
  process.stderr.write("Run: node scripts/sync-mcp-common.mjs\n")
  process.exit(1)
}
