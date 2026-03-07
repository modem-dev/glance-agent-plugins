/**
 * glance.sh – Live image paste from browser to agent.
 *
 * Pi extension that maintains a persistent glance.sh session in the
 * background. Images pasted by the user are automatically injected
 * into the conversation.
 *
 * Also registers:
 *   - `/glance` command — shows the session URL and opens it
 *   - `glance` tool — the LLM can call it to request a screenshot;
 *     it surfaces the existing session URL and waits for a paste.
 *
 * Install: symlink or copy this file into your pi extensions directory,
 *   e.g. ~/.pi/extensions/glance.ts
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

const BASE_URL = "https://glance.sh";

/** How long to wait on a single SSE connection before reconnecting. */
const SSE_TIMEOUT_MS = 305_000;

/** Pause between reconnect attempts on error. */
const RECONNECT_DELAY_MS = 3_000;

/** How often to create a fresh session (sessions have 10-min TTL). */
const SESSION_REFRESH_MS = 8 * 60 * 1000; // 8 minutes — well before expiry

interface SessionResponse {
  id: string;
  url: string;
}

interface ImageEvent {
  url: string;
  expiresAt: number;
}

interface GlanceDetails {
  sessionUrl?: string;
  imageUrl?: string;
  error?: string;
  expiresAt?: number;
}

// ── Persistent background session ──────────────────────────────────

let currentSession: SessionResponse | null = null;
let sessionCreatedAt = 0;
let abortController: AbortController | null = null;
let running = false;

async function createSession(): Promise<SessionResponse> {
  const res = await fetch(`${BASE_URL}/api/session`, { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const session = (await res.json()) as SessionResponse;
  currentSession = session;
  sessionCreatedAt = Date.now();
  return session;
}

function isSessionStale(): boolean {
  return Date.now() - sessionCreatedAt > SESSION_REFRESH_MS;
}

/**
 * Long-running background loop that:
 *  1. Creates/refreshes a session as needed
 *  2. Connects to SSE
 *  3. Yields every image event to `onImage`
 *  4. Reconnects on timeout/expiry/error
 */
async function backgroundLoop(
  pi: ExtensionAPI,
  onImage: (image: ImageEvent) => void,
) {
  running = true;
  abortController = new AbortController();
  const { signal } = abortController;

  while (!signal.aborted) {
    try {
      // Create or refresh session
      if (!currentSession || isSessionStale()) {
        await createSession();
      }

      // Connect SSE
      await listenForImages(currentSession!.id, signal, (image) => {
        onImage(image);
      });

      // listenForImages returned normally → SSE timed out or session expired.
      // Loop will reconnect (and refresh session if stale).
    } catch (err: any) {
      if (signal.aborted) break;
      // Transient error — wait and retry
      await sleep(RECONNECT_DELAY_MS);
    }
  }

  running = false;
}

// Status is managed by the tool/command via ctx.ui.setStatus.
// The background loop doesn't have direct UI access, so status
// updates happen when the tool or command is invoked.

function stopBackground() {
  try {
    abortController?.abort();
  } catch {
    // AbortError is expected during teardown
  }
  abortController = null;
  currentSession = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── SSE listener (multi-image) ─────────────────────────────────────

/**
 * Connects to the SSE stream and calls `onImage` for every `image`
 * event. Returns when the stream ends (timeout/expired/done).
 */
async function listenForImages(
  sessionId: string,
  signal: AbortSignal,
  onImage: (image: ImageEvent) => void,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/session/${sessionId}/events`, {
    signal,
    headers: { Accept: "text/event-stream" },
  });

  if (!res.ok || !res.body) {
    throw new Error(`SSE connect failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "";
  let dataLines: string[] = [];

  const timeout = setTimeout(() => {
    reader.cancel();
  }, SSE_TIMEOUT_MS);

  const onAbort = () => {
    clearTimeout(timeout);
    reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataLines.push(line.slice(6));
        } else if (line === "") {
          if (eventType === "image" && dataLines.length > 0) {
            const data = JSON.parse(dataLines.join("\n")) as ImageEvent;
            onImage(data);
          }
          if (eventType === "expired") {
            // Session gone — force refresh on next loop iteration
            currentSession = null;
            clearTimeout(timeout);
            return;
          }
          if (eventType === "timeout") {
            // Server-side timeout — reconnect
            clearTimeout(timeout);
            return;
          }
          eventType = "";
          dataLines = [];
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onAbort);
  }
}

// ── One-shot wait (for tool call) ──────────────────────────────────

/**
 * Wait for the next image on the current session.
 * Used by the `glance` tool to block until one image arrives.
 */
function waitForNextImage(signal?: AbortSignal): Promise<ImageEvent | null> {
  return new Promise<ImageEvent | null>((resolve) => {
    if (!currentSession) {
      resolve(null);
      return;
    }

    const timeout = setTimeout(() => resolve(null), SSE_TIMEOUT_MS);

    // Poll: check for new images by watching the background loop.
    // We do this by subscribing to a one-time callback.
    const key = `__glance_waiter_${Date.now()}`;
    (globalThis as any)[key] = (image: ImageEvent) => {
      clearTimeout(timeout);
      delete (globalThis as any)[key];
      resolve(image);
    };

    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      delete (globalThis as any)[key];
      resolve(null);
    });
  });
}

function getWaiterKeys(): string[] {
  return Object.keys(globalThis).filter((key) =>
    key.startsWith("__glance_waiter_"),
  );
}

function clearWaiters() {
  for (const key of getWaiterKeys()) {
    delete (globalThis as any)[key];
  }
}

/** Dispatch an image to any waiting tool call. */
function dispatchToWaiters(image: ImageEvent) {
  for (const key of getWaiterKeys()) {
    const fn = (globalThis as any)[key];
    if (typeof fn === "function") fn(image);
  }
}

export const __testing = {
  backgroundLoop,
  createSession,
  dispatchToWaiters,
  getState() {
    return {
      currentSession,
      running,
      sessionCreatedAt,
    };
  },
  isSessionStale,
  listenForImages,
  resetState() {
    stopBackground();
    sessionCreatedAt = 0;
    running = false;
    clearWaiters();
  },
  setSession(session: SessionResponse | null, createdAt = Date.now()) {
    currentSession = session;
    sessionCreatedAt = session ? createdAt : 0;
  },
  stopBackground,
  waitForNextImage,
};

// ── Extension entry point ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let imageCount = 0;

  function handleImage(image: ImageEvent) {
    imageCount++;
    // Dispatch to any blocking tool call first
    dispatchToWaiters(image);
    // Inject into conversation — use followUp so it queues if agent is busy
    pi.sendUserMessage(`Screenshot: ${image.url}`, { deliverAs: "followUp" });
  }

  // Start background listener when session starts
  pi.on("session_start", async () => {
    if (!running) {
      backgroundLoop(pi, handleImage).catch(() => {});
    }
  });

  // Stop on shutdown
  pi.on("session_shutdown", async () => {
    stopBackground();
  });

  // ── /glance command ──────────────────────────────────────────────

  pi.registerCommand("glance", {
    description: "Show the glance.sh session URL (paste screenshots there)",
    handler: async (_args, ctx) => {
      if (!currentSession) {
        ctx.ui.notify("No active glance session — starting one…", "info");
        try {
          await createSession();
          if (!running) {
            backgroundLoop(pi, handleImage).catch(() => {});
          }
        } catch (err: any) {
          ctx.ui.notify(`Failed to create session: ${err.message}`, "error");
          return;
        }
      }

      ctx.ui.notify(
        `Paste screenshots at ${currentSession!.url}`,
        "info",
      );
    },
  });

  // ── glance tool ──────────────────────────────────────────────────

  pi.registerTool({
    name: "glance",
    label: "Glance",
    description:
      "Open a live glance.sh session so the user can paste a screenshot from their browser. " +
      "The tool creates a session URL, waits for the user to paste, and returns the image URL. " +
      "Use this when you need to see the user's screen, a UI, an error dialog, or anything visual.",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, signal, onUpdate, ctx) {
      // Ensure session exists
      if (!currentSession) {
        try {
          await createSession();
          if (!running) {
            backgroundLoop(pi, handleImage).catch(() => {});
          }
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Failed to create session: ${err.message}` }],
            details: { error: err.message } as GlanceDetails,
            isError: true,
          };
        }
      }

      const sessionUrl = currentSession!.url;

      // Show the URL to the user
      onUpdate?.({
        content: [{ type: "text", text: `Waiting for image at ${sessionUrl}` }],
        details: { sessionUrl } as GlanceDetails,
      });

      if (ctx.hasUI) {
        ctx.ui.notify(`Open ${sessionUrl} and paste an image`, "info");
        ctx.ui.setStatus("glance", `👁 Waiting for paste at ${sessionUrl}`);
      }

      // Wait for the next image from the background listener
      const image = await waitForNextImage(signal);

      if (ctx.hasUI) ctx.ui.setStatus("glance", undefined);

      if (!image) {
        if (signal?.aborted) {
          return {
            content: [{ type: "text", text: "Cancelled" }],
            details: { sessionUrl, error: "cancelled" } as GlanceDetails,
          };
        }
        return {
          content: [{ type: "text", text: `Session timed out. Paste an image at ${sessionUrl}` }],
          details: { sessionUrl, error: "timeout" } as GlanceDetails,
        };
      }

      return {
        content: [{ type: "text", text: `Screenshot: ${image.url}` }],
        details: {
          sessionUrl,
          imageUrl: image.url,
          expiresAt: image.expiresAt,
        } as GlanceDetails,
      };
    },

    renderCall(_args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("glance ")) +
          theme.fg("muted", "waiting for screenshot…"),
        0,
        0,
      );
    },

    renderResult(result, _options, theme) {
      const details = result.details as GlanceDetails | undefined;

      if (result.isError || details?.error) {
        const msg = details?.error ?? "unknown error";
        return new Text(theme.fg("error", `✗ ${msg}`), 0, 0);
      }

      if (details?.imageUrl) {
        return new Text(
          theme.fg("success", "✓ ") + theme.fg("accent", details.imageUrl),
          0,
          0,
        );
      }

      if (details?.sessionUrl) {
        return new Text(
          theme.fg("warning", "⏳ ") + theme.fg("muted", details.sessionUrl),
          0,
          0,
        );
      }

      const text = result.content[0];
      return new Text(text?.type === "text" ? text.text : "", 0, 0);
    },
  });
}
