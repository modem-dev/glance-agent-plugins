#!/usr/bin/env node

import {
  createGlanceRuntime,
  createMcpServer,
  isMainModule,
} from "../common/mcp/glance-mcp.js"

export { createGlanceRuntime, createMcpServer }

export function createCodexMcpServer(options = {}) {
  const runtime = options.runtime ?? createGlanceRuntime(options.runtimeOptions)

  return createMcpServer({
    runtime,
    ...options.serverOptions,
  })
}

if (isMainModule(import.meta.url)) {
  const server = createCodexMcpServer()

  const shutdown = () => {
    server.stop()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  server.start()
}
