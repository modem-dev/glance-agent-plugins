import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createCodexMcpServer, createGlanceRuntime } from "./servers/glance-mcp.js"

type ToolResult = {
  content: Array<{ type: string; text: string }>
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  })
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

describe("codex glance plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("ships codex plugin manifest, MCP config, and npm package metadata", () => {
    const pluginJsonPath = fileURLToPath(new URL("./.codex-plugin/plugin.json", import.meta.url))
    const mcpJsonPath = fileURLToPath(new URL("./.mcp.json", import.meta.url))
    const packageJsonPath = fileURLToPath(new URL("./package.json", import.meta.url))

    const manifest = JSON.parse(readFileSync(pluginJsonPath, "utf8")) as Record<string, unknown>
    const mcpConfig = JSON.parse(readFileSync(mcpJsonPath, "utf8")) as {
      mcpServers?: Record<string, Record<string, unknown>>
    }
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      name?: string
      bin?: Record<string, string>
      main?: string
    }

    expect(manifest.name).toBe("glance-codex")
    expect(manifest.mcpServers).toBe("./.mcp.json")

    expect(mcpConfig.mcpServers?.glance?.command).toBe("node")
    expect(mcpConfig.mcpServers?.glance?.args).toEqual(["servers/glance-mcp.js"])
    expect(mcpConfig.mcpServers?.glance?.cwd).toBe(".")

    expect(packageJson.name).toBe("@modemdev/glance-codex")
    expect(packageJson.main).toBe("servers/glance-mcp.js")
    expect(packageJson.bin?.["glance-codex"]).toBe("servers/glance-mcp.js")
  })

  it("returns a session URL from glance", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "https://glance.sh/api/session") {
        return Promise.resolve(jsonResponse({ id: "sess-1", url: "/s/sess-1" }))
      }

      if (url === "https://glance.sh/api/session/sess-1/events") {
        return pendingSseResponse(init?.signal as AbortSignal | undefined)
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const runtime = createGlanceRuntime({ fetchImpl: fetchMock, quietLogs: true })

    const result = (await runtime.executeTool("glance")) as ToolResult

    expect(result.content[0].text).toContain("Session ready")
    expect(result.content[0].text).toContain("https://glance.sh/s/sess-1")

    runtime.stopBackground()
  })

  it("creates an MCP server that routes JSON-RPC tool calls", async () => {
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

    const server = createCodexMcpServer({
      runtime,
      serverOptions: {
        sendMessage: (message: Record<string, any>) => {
          sent.push(message)
        },
        quietLogs: true,
      },
    })

    await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "glance", arguments: {} },
    })

    expect(runtime.executeTool).toHaveBeenCalledWith("glance", {}, expect.any(AbortSignal))
    expect(sent).toContainEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: "Session ready" }],
      },
    })
  })
})
