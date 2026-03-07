import { describe, it, expect, vi, afterEach } from "vitest"

// Mock @opencode-ai/plugin — `tool()` is a passthrough that returns the config
vi.mock("@opencode-ai/plugin", () => ({
  tool: (config: any) => config,
}))

// Helper: dynamically import the plugin to get fresh module-level state
async function loadPlugin() {
  vi.resetModules()
  vi.doMock("@opencode-ai/plugin", () => ({
    tool: (config: any) => config,
  }))
  const mod = await import("./glance.js")
  return mod.GlancePlugin
}

function mockClient() {
  return { client: {} }
}

function mockContext(abort?: AbortSignal) {
  return {
    metadata: vi.fn(),
    abort,
  }
}

/**
 * Build a ReadableStream that emits the given SSE chunks, then hangs forever.
 * The hang prevents the background loop from spinning in a tight reconnect cycle.
 */
function sseStream(events: string[]) {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < events.length) {
        controller.enqueue(encoder.encode(events[i]))
        i++
        return
      }
      // Hang forever after all events are emitted
      return new Promise(() => {})
    },
  })
}

function cleanupWaiters() {
  for (const key of Object.keys(globalThis)) {
    if (key.startsWith("__glance_waiter_")) {
      delete (globalThis as any)[key]
    }
  }
}

function getOpenCodeWaiterKeys(): string[] {
  return Object.keys(globalThis).filter((key) =>
    key.startsWith("__glance_waiter_opencode_"),
  )
}

/**
 * URL-aware fetch mock. Routes by URL so both the background loop and
 * tool calls get correct responses regardless of call order.
 */
function routedFetch(opts: {
  session?: { id: string; url: string }
  sessionError?: number
  sseEvents?: string[]
}) {
  return vi.fn(async (url: string, _init?: any) => {
    if (url === "https://glance.sh/api/session") {
      if (opts.sessionError) {
        return { ok: false, status: opts.sessionError }
      }
      return {
        ok: true,
        json: async () => opts.session ?? { id: "test-id", url: "/s/test-id" },
      }
    }

    if (typeof url === "string" && url.includes("/events")) {
      return {
        ok: true,
        body: sseStream(opts.sseEvents ?? []),
      }
    }

    return { ok: false, status: 404 }
  })
}

describe("opencode glance plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanupWaiters()
  })

  describe("glance tool", () => {
    it("creates a session and returns the URL", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch({ session: { id: "abc123", url: "/s/abc123" } }),
      )

      const GlancePlugin = await loadPlugin()
      const plugin = await GlancePlugin(mockClient())
      const result = await plugin.tool.glance.execute({})

      expect(result).toContain("https://glance.sh/s/abc123")
      expect(result).toContain("Session ready")
    })

    it("reuses an existing session on second call", async () => {
      const fetchFn = routedFetch({
        session: { id: "abc123", url: "/s/abc123" },
      })
      vi.stubGlobal("fetch", fetchFn)

      const GlancePlugin = await loadPlugin()
      const plugin = await GlancePlugin(mockClient())

      // Let background loop create its session
      await new Promise((r) => setTimeout(r, 20))

      const r1 = await plugin.tool.glance.execute({})
      const r2 = await plugin.tool.glance.execute({})

      expect(r1).toContain("/s/abc123")
      expect(r2).toContain("/s/abc123")
    })

    it("returns error when session creation fails", async () => {
      vi.stubGlobal("fetch", routedFetch({ sessionError: 500 }))

      const GlancePlugin = await loadPlugin()
      const plugin = await GlancePlugin(mockClient())

      // Wait for background loop to fail
      await new Promise((r) => setTimeout(r, 50))

      const result = await plugin.tool.glance.execute({})
      expect(result).toContain("Failed to create session")
    })
  })

  describe("glance_wait tool", () => {
    it("returns error when no session exists", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("no network")),
      )

      const GlancePlugin = await loadPlugin()
      const plugin = await GlancePlugin(mockClient())

      // Give background loop time to fail
      await new Promise((r) => setTimeout(r, 50))

      const ctx = mockContext()
      const result = await plugin.tool.glance_wait.execute({}, ctx)
      expect(result).toContain("No active session")
    })

    it("returns image URL when image is dispatched", async () => {
      const imagePayload = JSON.stringify({
        url: "https://glance.sh/tok123.png",
        expiresAt: Date.now() + 60_000,
      })

      vi.stubGlobal(
        "fetch",
        routedFetch({
          session: { id: "sess1", url: "/s/sess1" },
          sseEvents: [
            `event: connected\ndata: {}\n\n`,
            `event: image\ndata: ${imagePayload}\n\n`,
          ],
        }),
      )

      const GlancePlugin = await loadPlugin()
      const plugin = await GlancePlugin(mockClient())

      // Ensure session exists
      await plugin.tool.glance.execute({})

      const ctx = mockContext()
      const result = await plugin.tool.glance_wait.execute({}, ctx)

      expect(result).toContain("https://glance.sh/tok123.png")
      expect(ctx.metadata).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Waiting for paste"),
        }),
      )
    })

    it("parses image events split across SSE chunks", async () => {
      const expiresAt = Date.now() + 60_000

      vi.stubGlobal(
        "fetch",
        routedFetch({
          session: { id: "sess-chunked", url: "/s/sess-chunked" },
          sseEvents: [
            'event: image\ndata: {"url":"https://glance.sh/chunked.png",',
            `"expiresAt":${expiresAt}}\n\n`,
          ],
        }),
      )

      const GlancePlugin = await loadPlugin()
      const plugin = await GlancePlugin(mockClient())

      await plugin.tool.glance.execute({})

      const ctx = mockContext()
      const result = await plugin.tool.glance_wait.execute({}, ctx)

      expect(result).toContain("https://glance.sh/chunked.png")
    })

    it("registers distinct waiters even within the same millisecond", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch({
          session: { id: "sess-waiters", url: "/s/sess-waiters" },
        }),
      )

      const GlancePlugin = await loadPlugin()
      const plugin = await GlancePlugin(mockClient())

      await plugin.tool.glance.execute({})

      const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(123)
      const ac1 = new AbortController()
      const ac2 = new AbortController()

      const wait1 = plugin.tool.glance_wait.execute({}, mockContext(ac1.signal))
      const wait2 = plugin.tool.glance_wait.execute({}, mockContext(ac2.signal))

      expect(getOpenCodeWaiterKeys()).toHaveLength(2)

      ac1.abort()
      ac2.abort()

      await expect(Promise.all([wait1, wait2])).resolves.toEqual([
        "Session timed out. Ask the user to paste an image at https://glance.sh/s/sess-waiters",
        "Session timed out. Ask the user to paste an image at https://glance.sh/s/sess-waiters",
      ])

      dateNowSpy.mockRestore()
    })

    it("returns timeout message when aborted", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch({
          session: { id: "sess2", url: "/s/sess2" },
        }),
      )

      const GlancePlugin = await loadPlugin()
      const plugin = await GlancePlugin(mockClient())
      await plugin.tool.glance.execute({})

      const ac = new AbortController()
      const ctx = mockContext(ac.signal)

      const waitPromise = plugin.tool.glance_wait.execute({}, ctx)
      await new Promise((r) => setTimeout(r, 50))
      ac.abort()

      const result = await waitPromise
      expect(result).toContain("timed out")
    })
  })
})
