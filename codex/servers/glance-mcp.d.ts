import type {
  GlanceRuntime,
  McpRuntime,
  McpServer,
} from "../../claude/servers/glance-mcp.js"

export { createGlanceRuntime, createMcpServer } from "../../claude/servers/glance-mcp.js"

export interface CodexMcpServerOptions {
  runtime?: McpRuntime
  runtimeOptions?: Parameters<
    typeof import("../../claude/servers/glance-mcp.js").createGlanceRuntime
  >[0]
  serverOptions?: Parameters<
    typeof import("../../claude/servers/glance-mcp.js").createMcpServer
  >[0]
}

export function createGlanceRuntime(options?: {
  baseUrl?: string
  fetchImpl?: typeof fetch
  log?: (message: string) => void
  quietLogs?: boolean
}): GlanceRuntime

export function createMcpServer(options?: {
  runtime?: McpRuntime
  stdin?: NodeJS.ReadableStream
  stdout?: NodeJS.WritableStream
  stderr?: NodeJS.WritableStream
  sendMessage?: (message: Record<string, unknown>) => void
  exit?: (code: number) => void
  log?: (message: string) => void
  quietLogs?: boolean
}): McpServer

export function createCodexMcpServer(options?: CodexMcpServerOptions): McpServer
