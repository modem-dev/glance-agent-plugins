/**
 * glance.sh – Live image paste from browser to agent.
 *
 * OpenCode plugin that maintains a persistent glance.sh session in the
 * background. Images pasted by the user are automatically surfaced to
 * the LLM.
 *
 * Registers a `glance` tool — the LLM can call it to request a
 * screenshot; it surfaces the existing session URL and waits for a
 * paste.
 *
 * Install: add "@modemdev/glance-opencode" to the `plugin` list in
 * opencode.json (recommended), or symlink/copy this file into your
 * plugins directory, e.g. .opencode/plugins/glance.ts or
 * ~/.config/opencode/plugins/glance.ts
 */

import { type Plugin, tool } from "@opencode-ai/plugin"

const BASE_URL = "https://glance.sh"

/** How long to wait on a single SSE connection before reconnecting. */
const SSE_TIMEOUT_MS = 305_000

/** Pause between reconnect attempts on error. */
const RECONNECT_DELAY_MS = 3_000

/** How often to create a fresh session (sessions have 10-min TTL). */
const SESSION_REFRESH_MS = 8 * 60 * 1000

const WAITER_PREFIX = "__glance_waiter_opencode_"

interface SessionResponse {
  id: string
  url: string
}

interface ImageEvent {
  url: string
  expiresAt: number
}

// ── Persistent background session ──────────────────────────────────

let currentSession: SessionResponse | null = null
let sessionCreatedAt = 0
let abortController: AbortController | null = null
let running = false
let waiterCounter = 0

async function createSession(): Promise<SessionResponse> {
  const res = await fetch(`${BASE_URL}/api/session`, { method: "POST" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const session = (await res.json()) as SessionResponse
  currentSession = session
  sessionCreatedAt = Date.now()
  return session
}

function isSessionStale(): boolean {
  return Date.now() - sessionCreatedAt > SESSION_REFRESH_MS
}

/**
 * Long-running background loop that:
 *  1. Creates/refreshes a session as needed
 *  2. Connects to SSE
 *  3. Yields every image event to `onImage`
 *  4. Reconnects on timeout/expiry/error
 */
async function backgroundLoop(onImage: (image: ImageEvent) => void) {
  running = true
  abortController = new AbortController()
  const { signal } = abortController

  while (!signal.aborted) {
    try {
      if (!currentSession || isSessionStale()) {
        await createSession()
      }

      await listenForImages(currentSession!.id, signal, (image) => {
        onImage(image)
      })
    } catch (err: any) {
      if (signal.aborted) break
      await sleep(RECONNECT_DELAY_MS)
    }
  }

  running = false
}

function stopBackground() {
  try {
    abortController?.abort()
  } catch {
    // AbortError is expected during teardown
  }
  abortController = null
  currentSession = null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function nextWaiterKey(): string {
  waiterCounter += 1
  return `${WAITER_PREFIX}${Date.now()}_${waiterCounter}`
}

// ── SSE listener (multi-image) ─────────────────────────────────────

async function listenForImages(
  sessionId: string,
  signal: AbortSignal,
  onImage: (image: ImageEvent) => void,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/session/${sessionId}/events`, {
    signal,
    headers: { Accept: "text/event-stream" },
  })

  if (!res.ok || !res.body) {
    throw new Error(`SSE connect failed: HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventType = ""
  let dataLines: string[] = []

  const timeout = setTimeout(() => {
    reader.cancel()
  }, SSE_TIMEOUT_MS)

  const onAbort = () => {
    clearTimeout(timeout)
    reader.cancel().catch(() => {})
  }
  signal.addEventListener("abort", onAbort, { once: true })

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith("data: ")) {
          dataLines.push(line.slice(6))
        } else if (line === "") {
          if (eventType === "image" && dataLines.length > 0) {
            const data = JSON.parse(dataLines.join("\n")) as ImageEvent
            onImage(data)
          }
          if (eventType === "expired") {
            currentSession = null
            clearTimeout(timeout)
            return
          }
          if (eventType === "timeout") {
            clearTimeout(timeout)
            return
          }
          eventType = ""
          dataLines = []
        }
      }
    }
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener("abort", onAbort)
  }
}

// ── One-shot wait (for tool call) ──────────────────────────────────

function waitForNextImage(signal?: AbortSignal): Promise<ImageEvent | null> {
  return new Promise<ImageEvent | null>((resolve) => {
    if (!currentSession) {
      resolve(null)
      return
    }

    const timeout = setTimeout(() => resolve(null), SSE_TIMEOUT_MS)

    const key = nextWaiterKey()
    ;(globalThis as any)[key] = (image: ImageEvent) => {
      clearTimeout(timeout)
      delete (globalThis as any)[key]
      resolve(image)
    }

    signal?.addEventListener("abort", () => {
      clearTimeout(timeout)
      delete (globalThis as any)[key]
      resolve(null)
    })
  })
}

function dispatchToWaiters(image: ImageEvent) {
  for (const key of Object.keys(globalThis)) {
    if (key.startsWith(WAITER_PREFIX)) {
      const fn = (globalThis as any)[key]
      if (typeof fn === "function") fn(image)
    }
  }
}

// ── Plugin entry point ─────────────────────────────────────────────

export const GlancePlugin: Plugin = async ({ client }) => {
  function handleImage(image: ImageEvent) {
    dispatchToWaiters(image)
  }

  // Start background listener immediately
  if (!running) {
    backgroundLoop(handleImage).catch(() => {})
  }

  return {
    event: async ({ event }) => {
      // Clean up on session delete
      if (event.type === "session.deleted") {
        stopBackground()
      }
    },

    tool: {
      glance: tool({
        description:
          "Open a live glance.sh session so the user can paste a screenshot from their browser. " +
          "The tool returns a session URL for the user to open. After sharing the URL with the " +
          "user, call glance_wait to block until they paste an image. " +
          "Use this when you need to see the user's screen, a UI, an error dialog, or anything visual.",
        args: {},
        async execute() {
          // Ensure session exists
          if (!currentSession) {
            try {
              await createSession()
              if (!running) {
                backgroundLoop(handleImage).catch(() => {})
              }
            } catch (err: any) {
              return `Failed to create session: ${err.message}`
            }
          }

          const sessionUrl = `${BASE_URL}${currentSession!.url}`
          return `Session ready. Ask the user to paste an image at ${sessionUrl}`
        },
      }),

      glance_wait: tool({
        description:
          "Wait for the user to paste an image into the glance.sh session. " +
          "Call glance first to get the session URL and share it with the user, " +
          "then call this tool to block until an image arrives. Returns the image URL.",
        args: {},
        async execute(_args, context) {
          if (!currentSession) {
            return "No active session. Call glance first to create one."
          }

          const sessionUrl = `${BASE_URL}${currentSession!.url}`

          context.metadata({
            title: `Waiting for paste at ${sessionUrl}`,
            metadata: { sessionUrl },
          })

          const image = await waitForNextImage(context.abort)

          if (!image) {
            return `Session timed out. Ask the user to paste an image at ${sessionUrl}`
          }

          return `Screenshot: ${image.url}`
        },
      }),
    },
  }
}
