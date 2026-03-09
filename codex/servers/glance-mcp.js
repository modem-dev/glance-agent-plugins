#!/usr/bin/env node

import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

const DEFAULT_BASE_URL = process.env.GLANCE_BASE_URL?.trim() || "https://glance.sh"

/** How long to wait on one SSE connection before reconnecting. */
const SSE_TIMEOUT_MS = 305_000

/** Pause between reconnect attempts on transient errors. */
const RECONNECT_DELAY_MS = 3_000

/** How often to mint a fresh session (sessions have 10-minute TTL). */
const SESSION_REFRESH_MS = 8 * 60 * 1000

const WAITER_PREFIX = "glance_waiter_"

const TOOL_DEFINITIONS = [
  {
    name: "glance",
    description:
      "Open a live glance.sh session so the user can paste a screenshot from their browser. " +
      "Return the session URL for the user to open, then call glance_wait to block for the next image. " +
      "Use this when you need to see the user's screen, a UI, an error dialog, or anything visual.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "glance_wait",
    description:
      "Wait for the user to paste an image into the active glance.sh session and return the image URL. " +
      "Call glance first to get the session URL, share it with the user, then call this tool.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
]

function normalizeSessionUrl(url, baseUrl) {
  return new URL(url, baseUrl).toString()
}

function toTextResult(text, extra = {}) {
  return {
    content: [{ type: "text", text }],
    ...extra,
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }

    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export function createGlanceRuntime(options = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const log =
    options.log ??
    ((message) => {
      if (!options.quietLogs) {
        process.stderr.write(`[glance-mcp] ${message}\n`)
      }
    })

  if (!fetchImpl) {
    throw new Error("Fetch API is required (Node 18+)")
  }

  let currentSession = null
  let sessionCreatedAt = 0
  let running = false
  let abortController = null
  let createSessionPromise = null
  let waiterCounter = 0

  const waiters = new Map()

  function nextWaiterKey() {
    waiterCounter += 1
    return `${WAITER_PREFIX}${Date.now()}_${waiterCounter}`
  }

  function isSessionStale() {
    return Date.now() - sessionCreatedAt > SESSION_REFRESH_MS
  }

  function getSessionUrl() {
    return currentSession?.url
  }

  async function createSession() {
    const res = await fetchImpl(`${baseUrl}/api/session`, { method: "POST" })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const session = await res.json()

    if (!session || typeof session.id !== "string" || typeof session.url !== "string") {
      throw new Error("Invalid session response")
    }

    currentSession = {
      id: session.id,
      url: normalizeSessionUrl(session.url, baseUrl),
    }
    sessionCreatedAt = Date.now()
    return currentSession
  }

  async function ensureSession() {
    if (currentSession && !isSessionStale()) {
      return currentSession
    }

    if (!createSessionPromise) {
      createSessionPromise = createSession().finally(() => {
        createSessionPromise = null
      })
    }

    return await createSessionPromise
  }

  function dispatchToWaiters(image) {
    for (const resolve of [...waiters.values()]) {
      resolve(image)
    }
  }

  function clearWaiters() {
    for (const resolve of [...waiters.values()]) {
      resolve(null)
    }
  }

  async function listenForImages(sessionId, signal) {
    const res = await fetchImpl(`${baseUrl}/api/session/${sessionId}/events`, {
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
    let dataLines = []

    const timeout = setTimeout(() => {
      reader.cancel().catch(() => {})
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

        for (const rawLine of lines) {
          const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine

          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim()
            continue
          }

          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart())
            continue
          }

          if (line !== "") {
            continue
          }

          if (eventType === "image" && dataLines.length > 0) {
            try {
              const image = JSON.parse(dataLines.join("\n"))

              if (
                image &&
                typeof image.url === "string" &&
                typeof image.expiresAt === "number"
              ) {
                dispatchToWaiters(image)
              }
            } catch {
              log("Failed to parse image event payload")
            }
          }

          if (eventType === "expired") {
            currentSession = null
            return
          }

          if (eventType === "timeout") {
            return
          }

          eventType = ""
          dataLines = []
        }
      }
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener("abort", onAbort)
    }
  }

  async function backgroundLoop(signal) {
    while (!signal.aborted) {
      try {
        const session = await ensureSession()
        await listenForImages(session.id, signal)
      } catch (err) {
        if (signal.aborted) break
        await sleep(RECONNECT_DELAY_MS, signal)
      }
    }

    running = false
  }

  function startBackground() {
    if (running) return

    running = true
    abortController = new AbortController()

    backgroundLoop(abortController.signal).catch((err) => {
      log(`Background loop error: ${err instanceof Error ? err.message : String(err)}`)
      running = false
    })
  }

  function stopBackground() {
    abortController?.abort()
    abortController = null
    currentSession = null
    running = false
    clearWaiters()
  }

  function waitForNextImage(signal) {
    return new Promise((resolve) => {
      if (!currentSession) {
        resolve(null)
        return
      }

      if (signal?.aborted) {
        resolve(null)
        return
      }

      const key = nextWaiterKey()

      const timeout = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort)
        waiters.delete(key)
        resolve(null)
      }, SSE_TIMEOUT_MS)

      const finish = (image) => {
        clearTimeout(timeout)
        signal?.removeEventListener("abort", onAbort)
        waiters.delete(key)
        resolve(image)
      }

      const onAbort = () => finish(null)

      waiters.set(key, finish)
      signal?.addEventListener("abort", onAbort, { once: true })
    })
  }

  async function executeTool(name, args = {}, signal) {
    if (name === "glance") {
      try {
        const session = await ensureSession()
        startBackground()

        const sessionUrl = session.url

        return toTextResult(
          `Session ready. Ask the user to paste an image at ${sessionUrl}. Then call glance_wait.`,
          {
            structuredContent: {
              sessionUrl,
            },
          },
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)

        return toTextResult(`Failed to create session: ${message}`, {
          isError: true,
          structuredContent: { error: message },
        })
      }
    }

    if (name === "glance_wait") {
      if (!currentSession) {
        return toTextResult("No active session. Call glance first to create one.", {
          isError: true,
          structuredContent: { error: "no_active_session" },
        })
      }

      startBackground()

      const sessionUrl = currentSession.url
      const image = await waitForNextImage(signal)

      if (!image) {
        if (signal?.aborted) {
          return toTextResult("Cancelled", {
            structuredContent: {
              sessionUrl,
              error: "cancelled",
            },
          })
        }

        return toTextResult(`Session timed out. Ask the user to paste an image at ${sessionUrl}`, {
          structuredContent: {
            sessionUrl,
            error: "timeout",
          },
        })
      }

      return toTextResult(`Screenshot: ${image.url}`, {
        structuredContent: {
          sessionUrl,
          imageUrl: image.url,
          expiresAt: image.expiresAt,
        },
      })
    }

    return toTextResult(`Unknown tool: ${name}`, {
      isError: true,
      structuredContent: { error: "unknown_tool" },
    })
  }

  return {
    executeTool,
    getTools() {
      return TOOL_DEFINITIONS
    },
    getState() {
      return {
        currentSession,
        running,
        sessionCreatedAt,
        waiterCount: waiters.size,
      }
    },
    startBackground,
    stopBackground,
  }
}

function toError(id, code, message, data) {
  const error = {
    code,
    message,
  }

  if (data !== undefined) {
    error.data = data
  }

  return {
    jsonrpc: "2.0",
    id,
    error,
  }
}

function toResult(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  }
}

function isRequest(message) {
  return message && typeof message === "object" && "id" in message
}

export function createMcpServer(options = {}) {
  const runtime = options.runtime ?? createGlanceRuntime()
  const stdin = options.stdin ?? process.stdin
  const stdout = options.stdout ?? process.stdout
  const stderr = options.stderr ?? process.stderr
  const exit = options.exit ?? ((code) => process.exit(code))
  const log =
    options.log ??
    ((message) => {
      if (!options.quietLogs) {
        stderr.write(`[glance-mcp] ${message}\n`)
      }
    })

  const inFlight = new Map()
  let readBuffer = Buffer.alloc(0)
  let started = false
  let outputMode = options.outputMode === "line" ? "line" : "framed"

  const sendMessage =
    options.sendMessage ??
    ((message) => {
      const payload = JSON.stringify(message)

      if (outputMode === "line") {
        stdout.write(`${payload}\n`)
        return
      }

      const frame = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`
      stdout.write(frame)
    })

  function sendResult(id, result) {
    sendMessage(toResult(id, result))
  }

  function sendError(id, code, message, data) {
    sendMessage(toError(id, code, message, data))
  }

  async function handleRequest(message) {
    const { id, method, params } = message

    if (method === "initialize") {
      sendResult(id, {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        serverInfo: {
          name: "glance-sh",
          version: "0.1.0",
        },
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
      })
      return
    }

    if (method === "ping") {
      sendResult(id, {})
      return
    }

    if (method === "tools/list") {
      sendResult(id, {
        tools: runtime.getTools(),
      })
      return
    }

    if (method === "tools/call") {
      const toolName = params?.name
      const toolArgs = params?.arguments ?? {}

      if (typeof toolName !== "string" || toolName.length === 0) {
        sendError(id, -32602, "Invalid params: expected tool name")
        return
      }

      const abortController = new AbortController()
      inFlight.set(id, abortController)

      try {
        const result = await runtime.executeTool(toolName, toolArgs, abortController.signal)
        sendResult(id, result)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        sendError(id, -32000, "Tool execution failed", { message })
      } finally {
        inFlight.delete(id)
      }

      return
    }

    if (method === "shutdown") {
      runtime.stopBackground()
      sendResult(id, {})
      return
    }

    sendError(id, -32601, `Method not found: ${method}`)
  }

  function handleNotification(message) {
    if (message.method === "notifications/cancelled") {
      const requestId = message.params?.requestId
      const controller = inFlight.get(requestId)
      controller?.abort()
      return
    }

    if (
      message.method === "notifications/initialized" ||
      message.method === "notifications/tools/list_changed"
    ) {
      return
    }

    if (message.method === "exit" || message.method === "notifications/exit") {
      stop()
      exit(0)
    }
  }

  async function handleMessage(message) {
    if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
      sendError(null, -32600, "Invalid Request")
      return
    }

    if (typeof message.method !== "string") {
      sendError(isRequest(message) ? message.id : null, -32600, "Invalid Request")
      return
    }

    if (isRequest(message)) {
      await handleRequest(message)
      return
    }

    handleNotification(message)
  }

  function readHeaderFrame(buffer) {
    const crlfEnd = buffer.indexOf("\r\n\r\n")
    const lfEnd = buffer.indexOf("\n\n")

    let headerEnd = -1
    let separatorLength = 0

    if (crlfEnd !== -1 && (lfEnd === -1 || crlfEnd < lfEnd)) {
      headerEnd = crlfEnd
      separatorLength = 4
    } else if (lfEnd !== -1) {
      headerEnd = lfEnd
      separatorLength = 2
    }

    if (headerEnd === -1) {
      return null
    }

    const header = buffer.slice(0, headerEnd).toString("utf8")
    const lengthMatch = header.match(/content-length:\s*(\d+)/i)

    if (!lengthMatch) {
      return {
        error: "missing_content_length",
      }
    }

    const contentLength = Number(lengthMatch[1])
    const messageStart = headerEnd + separatorLength
    const messageEnd = messageStart + contentLength

    if (buffer.length < messageEnd) {
      return null
    }

    return {
      payload: buffer.slice(messageStart, messageEnd).toString("utf8"),
      rest: buffer.slice(messageEnd),
    }
  }

  function readLineFrame(buffer) {
    const text = buffer.toString("utf8")
    const trimmedStart = text.trimStart()

    if (!(trimmedStart.startsWith("{") || trimmedStart.startsWith("["))) {
      return null
    }

    const newlineIndex = text.indexOf("\n")

    if (newlineIndex === -1) {
      return null
    }

    const line = text.slice(0, newlineIndex).trim()

    return {
      payload: line.length > 0 ? line : null,
      rest: Buffer.from(text.slice(newlineIndex + 1), "utf8"),
    }
  }

  function dispatchMessagePayload(payload) {
    if (!payload) {
      return
    }

    let message

    try {
      message = JSON.parse(payload)
    } catch {
      sendError(null, -32700, "Parse error")
      return
    }

    handleMessage(message).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Request handler failure: ${msg}`)

      if (isRequest(message)) {
        sendError(message.id, -32603, "Internal error")
      }
    })
  }

  function handleData(chunk) {
    const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    readBuffer = Buffer.concat([readBuffer, chunkBuffer])

    while (true) {
      const headerFrame = readHeaderFrame(readBuffer)

      if (headerFrame?.error === "missing_content_length") {
        readBuffer = Buffer.alloc(0)
        sendError(null, -32600, "Invalid Request: missing Content-Length")
        return
      }

      if (headerFrame?.payload !== undefined) {
        outputMode = "framed"
        readBuffer = headerFrame.rest
        dispatchMessagePayload(headerFrame.payload)
        continue
      }

      const lineFrame = readLineFrame(readBuffer)

      if (lineFrame) {
        outputMode = "line"
        readBuffer = lineFrame.rest
        dispatchMessagePayload(lineFrame.payload)
        continue
      }

      return
    }
  }

  function stop() {
    if (!started) return

    stdin.off("data", handleData)
    runtime.stopBackground()

    for (const controller of inFlight.values()) {
      controller.abort()
    }

    inFlight.clear()
    started = false
  }

  function start() {
    if (started) return

    started = true
    stdin.on("data", handleData)

    if (typeof stdin.resume === "function") {
      stdin.resume()
    }
  }

  return {
    handleData,
    handleMessage,
    start,
    stop,
  }
}

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

  try {
    const invokedPath = realpathSync(process.argv[1])
    const currentPath = realpathSync(fileURLToPath(import.meta.url))
    return invokedPath === currentPath
  } catch {
    return false
  }
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
