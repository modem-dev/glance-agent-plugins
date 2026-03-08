import { pathToFileURL } from "node:url"

import {
  createGlanceRuntime,
  createMcpServer,
} from "../../claude/servers/glance-mcp.js"

export { createGlanceRuntime, createMcpServer }

export function createCodexMcpServer(options = {}) {
  const runtime = options.runtime ?? createGlanceRuntime(options.runtimeOptions)
  return createMcpServer({
    runtime,
    ...options.serverOptions,
  })
}

function isMainModule() {
  if (!process.argv[1]) {
    return false
  }

  return import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isMainModule()) {
  const server = createCodexMcpServer()

  const shutdown = () => {
    server.stop()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  server.start()
}
