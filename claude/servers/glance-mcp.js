import {
  createGlanceRuntime,
  createMcpServer,
  isMainModule,
} from "../common/mcp/glance-mcp.js"

export { createGlanceRuntime, createMcpServer }

if (isMainModule(import.meta.url)) {
  const runtime = createGlanceRuntime()
  const server = createMcpServer({ runtime })

  const shutdown = () => {
    server.stop()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  server.start()
}
