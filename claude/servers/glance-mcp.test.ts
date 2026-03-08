import { Writable } from "node:stream"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createGlanceRuntime, createMcpServer } from "./glance-mcp.js"

type ToolResult = {
  content: Array<{ type: string; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  })
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    }),
    {
      headers: { "content-type": "text/event-stream" },
      status: 200,
    },
  )
}

function pendingSseResponse(signal?: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener(
      "abort",
      () => {
        reject(new DOMException("Aborted", "AbortError"))
      },
      { once: true },
    )
  })
}

function createControlledSseResponse() {
  const encoder = new TextEncoder()

  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let readyResolve: (() => void) | null = null

  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve
  })

  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController
        readyResolve?.()
      },
    }),
    {
      headers: { "content-type": "text/event-stream" },
      status: 200,
    },
  )

  return {
    response,
    ready,
    async push(chunk: string) {
      await ready
      controller?.enqueue(encoder.encode(chunk))
    },
    async close() {
      await ready
      controller?.close()
    },
  }
}

function encodeMessageFrame(
  message: Record<string, unknown>,
  options?: { lineEnding?: "crlf" | "lf" },
): Buffer {
  const payload = JSON.stringify(message)
  const lineBreak = options?.lineEnding === "lf" ? "\n" : "\r\n"

  return Buffer.from(
    `Content-Length: ${Buffer.byteLength(payload, "utf8")}${lineBreak}${lineBreak}${payload}`,
    "utf8",
  )
}

class MemoryWritable extends Writable {
  readonly chunks: Buffer[] = []

  _write(chunk: string | Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    callback()
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks)
  }

  toString(): string {
    return this.toBuffer().toString("utf8")
  }
}

describe("claude glance runtime", () => {
  const runtimes: Array<ReturnType<typeof createGlanceRuntime>> = []

  function createRuntime(options: Record<string, unknown>) {
    const runtime = createGlanceRuntime({ quietLogs: true, ...options })
    runtimes.push(runtime)
    return runtime
  }

  afterEach(() => {
    for (const runtime of runtimes) {
      runtime.stopBackground()
    }

    runtimes.length = 0
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("creates a session and returns a session URL from glance", async () => {
    const fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "https://glance.sh/api/session") {
        return Promise.resolve(jsonResponse({ id: "sess-1", url: "/s/sess-1" }))
      }

      if (url === "https://glance.sh/api/session/sess-1/events") {
        return pendingSseResponse(init?.signal as AbortSignal | undefined)
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const runtime = createRuntime({ fetchImpl: fetchMock })

    const result = (await runtime.executeTool("glance")) as ToolResult

    expect(result.content[0].text).toContain("Session ready")
    expect(result.content[0].text).toContain("https://glance.sh/s/sess-1")
    expect(fetchMock).toHaveBeenCalledWith("https://glance.sh/api/session", {
      method: "POST",
    })
  })

  it("reuses active sessions and refreshes stale sessions", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-08T15:00:00.000Z"))

    let sessionCalls = 0

    const fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "https://glance.sh/api/session") {
        sessionCalls += 1
        return Promise.resolve(
          jsonResponse({
            id: `sess-${sessionCalls}`,
            url: `/s/sess-${sessionCalls}`,
          }),
        )
      }

      if (url.includes("/events")) {
        return pendingSseResponse(init?.signal as AbortSignal | undefined)
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const runtime = createRuntime({ fetchImpl: fetchMock })

    const first = (await runtime.executeTool("glance")) as ToolResult
    const second = (await runtime.executeTool("glance")) as ToolResult

    expect(sessionCalls).toBe(1)
    expect(first.content[0].text).toContain("https://glance.sh/s/sess-1")
    expect(second.content[0].text).toContain("https://glance.sh/s/sess-1")

    vi.setSystemTime(new Date("2026-03-08T15:08:01.000Z"))

    const refreshed = (await runtime.executeTool("glance")) as ToolResult

    expect(sessionCalls).toBe(2)
    expect(refreshed.content[0].text).toContain("https://glance.sh/s/sess-2")
  })

  it("returns the next image URL from glance_wait", async () => {
    const sse = createControlledSseResponse()

    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input)

      if (url === "https://glance.sh/api/session") {
        return Promise.resolve(jsonResponse({ id: "sess-image", url: "/s/sess-image" }))
      }

      if (url === "https://glance.sh/api/session/sess-image/events") {
        return Promise.resolve(sse.response)
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const runtime = createRuntime({ fetchImpl: fetchMock })

    await runtime.executeTool("glance")

    const waitPromise = runtime.executeTool("glance_wait") as Promise<ToolResult>

    await Promise.resolve()
    await sse.push('event: image\ndata: {"url":"https://glance.sh/chunked.png",')
    await sse.push('"expiresAt":123}\n\n')

    const result = await waitPromise

    expect(result.content[0].text).toBe("Screenshot: https://glance.sh/chunked.png")
    await sse.close()
  })

  it("handles session expiry by rotating to a fresh session", async () => {
    let sessionCalls = 0

    const fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "https://glance.sh/api/session") {
        sessionCalls += 1
        return Promise.resolve(
          jsonResponse({
            id: `sess-${sessionCalls}`,
            url: `/s/sess-${sessionCalls}`,
          }),
        )
      }

      if (url === "https://glance.sh/api/session/sess-1/events") {
        return Promise.resolve(sseResponse(["event: expired\n\n"]))
      }

      if (url === "https://glance.sh/api/session/sess-2/events") {
        return pendingSseResponse(init?.signal as AbortSignal | undefined)
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const runtime = createRuntime({ fetchImpl: fetchMock })

    await runtime.executeTool("glance")

    await vi.waitFor(() => {
      expect(sessionCalls).toBe(2)
    })

    expect(runtime.getState().currentSession).toEqual({
      id: "sess-2",
      url: "https://glance.sh/s/sess-2",
    })
  })

  it("returns a helpful error when glance_wait is called before glance", async () => {
    const runtime = createRuntime({ fetchImpl: vi.fn() })

    const result = (await runtime.executeTool("glance_wait")) as ToolResult

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("No active session")
  })

  it("returns cancelled when glance_wait is aborted", async () => {
    const fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "https://glance.sh/api/session") {
        return Promise.resolve(jsonResponse({ id: "sess-abort", url: "/s/sess-abort" }))
      }

      if (url === "https://glance.sh/api/session/sess-abort/events") {
        return pendingSseResponse(init?.signal as AbortSignal | undefined)
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const runtime = createRuntime({ fetchImpl: fetchMock })

    await runtime.executeTool("glance")

    const abortController = new AbortController()

    const waitPromise = runtime.executeTool(
      "glance_wait",
      {},
      abortController.signal,
    ) as Promise<ToolResult>

    await Promise.resolve()
    abortController.abort()

    const result = await waitPromise

    expect(result.content[0].text).toBe("Cancelled")
  })
})

describe("claude glance MCP server", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("responds to initialize, tools/list, tools/call, and shutdown", async () => {
    const runtime = {
      getTools: vi.fn(() => [
        {
          name: "glance",
          description: "glance tool",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ]),
      executeTool: vi.fn(async () => ({
        content: [{ type: "text", text: "Session ready" }],
      })),
      stopBackground: vi.fn(),
    }

    const sent: Array<Record<string, any>> = []

    const server = createMcpServer({
      runtime,
      sendMessage: (message: Record<string, any>) => {
        sent.push(message)
      },
      quietLogs: true,
    })

    await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    })
    await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    await server.handleMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "glance", arguments: {} },
    })
    await server.handleMessage({ jsonrpc: "2.0", id: 4, method: "shutdown" })

    expect(sent[0].id).toBe(1)
    expect(sent[0].result.serverInfo.name).toBe("glance-sh")

    expect(sent[1]).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: [
          {
            name: "glance",
            description: "glance tool",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      },
    })

    expect(runtime.executeTool).toHaveBeenCalledWith("glance", {}, expect.any(AbortSignal))
    expect(sent[2]).toEqual({
      jsonrpc: "2.0",
      id: 3,
      result: {
        content: [{ type: "text", text: "Session ready" }],
      },
    })

    expect(runtime.stopBackground).toHaveBeenCalledTimes(1)
    expect(sent[3]).toEqual({ jsonrpc: "2.0", id: 4, result: {} })
  })

  it("aborts in-flight tool calls when notifications/cancelled arrives", async () => {
    const runtime = {
      getTools: vi.fn(() => []),
      executeTool: vi.fn(
        (_name: string, _args: Record<string, unknown>, signal: AbortSignal) =>
          new Promise<ToolResult>((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                resolve({ content: [{ type: "text", text: "Cancelled" }] })
              },
              { once: true },
            )
          }),
      ),
      stopBackground: vi.fn(),
    }

    const sent: Array<Record<string, any>> = []

    const server = createMcpServer({
      runtime,
      sendMessage: (message: Record<string, any>) => {
        sent.push(message)
      },
      quietLogs: true,
    })

    const callPromise = server.handleMessage({
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: { name: "glance_wait", arguments: {} },
    })

    await Promise.resolve()

    await server.handleMessage({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 42 },
    })

    await callPromise

    expect(sent).toContainEqual({
      jsonrpc: "2.0",
      id: 42,
      result: {
        content: [{ type: "text", text: "Cancelled" }],
      },
    })
  })

  it("parses Content-Length framed requests split across chunks", async () => {
    const runtime = {
      getTools: vi.fn(() => [
        {
          name: "glance",
          description: "glance tool",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ]),
      executeTool: vi.fn(),
      stopBackground: vi.fn(),
    }

    const sent: Array<Record<string, any>> = []

    const server = createMcpServer({
      runtime,
      sendMessage: (message: Record<string, any>) => {
        sent.push(message)
      },
      quietLogs: true,
    })

    const frame = encodeMessageFrame({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/list",
    })

    server.handleData(frame.subarray(0, 9))
    server.handleData(frame.subarray(9))

    await vi.waitFor(() => {
      expect(sent).toContainEqual({
        jsonrpc: "2.0",
        id: 7,
        result: {
          tools: [
            {
              name: "glance",
              description: "glance tool",
              inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
            },
          ],
        },
      })
    })
  })

  it("parses Content-Length framed requests that use LF-only separators", async () => {
    const runtime = {
      getTools: vi.fn(() => [
        {
          name: "glance",
          description: "glance tool",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ]),
      executeTool: vi.fn(),
      stopBackground: vi.fn(),
    }

    const sent: Array<Record<string, any>> = []

    const server = createMcpServer({
      runtime,
      sendMessage: (message: Record<string, any>) => {
        sent.push(message)
      },
      quietLogs: true,
    })

    const frame = encodeMessageFrame(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/list",
      },
      { lineEnding: "lf" },
    )

    server.handleData(frame)

    await vi.waitFor(() => {
      expect(sent).toContainEqual({
        jsonrpc: "2.0",
        id: 8,
        result: {
          tools: [
            {
              name: "glance",
              description: "glance tool",
              inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
            },
          ],
        },
      })
    })
  })

  it("parses newline-delimited JSON-RPC messages", async () => {
    const runtime = {
      getTools: vi.fn(() => [
        {
          name: "glance",
          description: "glance tool",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ]),
      executeTool: vi.fn(),
      stopBackground: vi.fn(),
    }

    const sent: Array<Record<string, any>> = []

    const server = createMcpServer({
      runtime,
      sendMessage: (message: Record<string, any>) => {
        sent.push(message)
      },
      quietLogs: true,
    })

    const payload = `${JSON.stringify({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/list",
    })}\n`

    server.handleData(Buffer.from(payload, "utf8"))

    await vi.waitFor(() => {
      expect(sent).toContainEqual({
        jsonrpc: "2.0",
        id: 9,
        result: {
          tools: [
            {
              name: "glance",
              description: "glance tool",
              inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
            },
          ],
        },
      })
    })
  })

  it("responds with newline-delimited JSON when input is newline-delimited", async () => {
    const runtime = {
      getTools: vi.fn(() => [
        {
          name: "glance",
          description: "glance tool",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ]),
      executeTool: vi.fn(),
      stopBackground: vi.fn(),
    }

    const stdout = new MemoryWritable()

    const server = createMcpServer({
      runtime,
      stdout,
      quietLogs: true,
    })

    const payload = `${JSON.stringify({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/list",
    })}\n`

    server.handleData(Buffer.from(payload, "utf8"))

    await vi.waitFor(() => {
      expect(stdout.toString()).not.toBe("")
    })

    const output = stdout.toString()

    expect(output).not.toContain("Content-Length:")
    expect(output.endsWith("\n")).toBe(true)
    expect(JSON.parse(output.trim())).toEqual({
      jsonrpc: "2.0",
      id: 10,
      result: {
        tools: [
          {
            name: "glance",
            description: "glance tool",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      },
    })
  })
})
