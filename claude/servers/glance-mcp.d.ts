export type McpTextContent = { type: string; text: string }

export interface ToolResult {
  content: McpTextContent[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export interface GlanceRuntime {
  executeTool(name: string, args?: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult>
  getTools(): Array<{
    name: string
    description: string
    inputSchema: Record<string, unknown>
  }>
  getState(): {
    currentSession: { id: string; url: string } | null
    running: boolean
    sessionCreatedAt: number
    waiterCount: number
  }
  startBackground(): void
  stopBackground(): void
}

export interface McpServer {
  handleData(chunk: Buffer | string): void
  handleMessage(message: Record<string, unknown>): Promise<void>
  start(): void
  stop(): void
}

export function createGlanceRuntime(options?: {
  baseUrl?: string
  fetchImpl?: typeof fetch
  log?: (message: string) => void
  quietLogs?: boolean
}): GlanceRuntime

export interface McpRuntime {
  getTools(): Array<{
    name: string
    description: string
    inputSchema: Record<string, unknown>
  }>
  executeTool(
    name: string,
    args?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolResult>
  stopBackground(): void
}

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
