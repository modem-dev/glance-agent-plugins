/**
 * glance.sh – Live image paste from browser to agent.
 *
 * Pi extension that registers a `glance` tool and `/glance` command.
 *
 *   1. Creates a session on glance.sh
 *   2. Gives the user a URL to open
 *   3. Listens via SSE for the pasted image
 *   4. Returns the image URL to the LLM
 *
 * Install: symlink or copy this file into your pi extensions directory,
 *   e.g. ~/.pi/extensions/glance.ts
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

const BASE_URL = "https://glance.sh";
const SSE_TIMEOUT_MS = 305_000; // just past server's 295s window

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

export default function (pi: ExtensionAPI) {
  // /glance command — user types it, pastes in browser, image URL lands in chat
  pi.registerCommand("glance", {
    description: "Open glance.sh to paste a screenshot for the agent",
    handler: async (_args, ctx) => {
      // 1. Create session
      ctx.ui.notify("Creating glance.sh session…", "info");

      let session: SessionResponse;
      try {
        const res = await fetch(`${BASE_URL}/api/session`, { method: "POST" });
        if (!res.ok) {
          ctx.ui.notify(`Failed to create session: HTTP ${res.status}`, "error");
          return;
        }
        session = (await res.json()) as SessionResponse;
      } catch (err: any) {
        ctx.ui.notify(`Failed to create session: ${err.message}`, "error");
        return;
      }

      // 2. Show URL and wait
      ctx.ui.notify(`Open ${session.url} and paste an image`, "info");
      ctx.ui.setStatus("glance", `👁 Waiting for paste at ${session.url}`);

      try {
        const image = await waitForImage(session.id);

        ctx.ui.setStatus("glance", undefined);

        if (!image) {
          ctx.ui.notify("Session timed out — no image pasted", "warning");
          return;
        }

        // 3. Send image URL as a user message so the LLM sees it
        ctx.ui.notify("Screenshot received!", "info");
        pi.sendUserMessage(`Screenshot: ${image.url}`);
      } catch (err: any) {
        ctx.ui.setStatus("glance", undefined);
        ctx.ui.notify(`SSE error: ${err.message}`, "error");
      }
    },
  });

  // Also register as a tool the LLM can call directly
  pi.registerTool({
    name: "glance",
    label: "Glance",
    description:
      "Open a live glance.sh session so the user can paste a screenshot from their browser. " +
      "The tool creates a session URL, waits for the user to paste, and returns the image URL. " +
      "Use this when you need to see the user's screen, a UI, an error dialog, or anything visual.",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, signal, onUpdate, ctx) {
      // 1. Create session
      let session: SessionResponse;
      try {
        const res = await fetch(`${BASE_URL}/api/session`, { method: "POST", signal });
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Failed to create session: HTTP ${res.status}` }],
            details: { error: `HTTP ${res.status}` } as GlanceDetails,
            isError: true,
          };
        }
        session = (await res.json()) as SessionResponse;
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Failed to create session: ${err.message}` }],
          details: { error: err.message } as GlanceDetails,
          isError: true,
        };
      }

      // 2. Show the URL to the user
      onUpdate?.({
        content: [{ type: "text", text: `Waiting for image at ${session.url}` }],
        details: { sessionUrl: session.url } as GlanceDetails,
      });

      if (ctx.hasUI) {
        ctx.ui.notify(`Open ${session.url} and paste an image`, "info");
        ctx.ui.setStatus("glance", `👁 Waiting for paste at ${session.url}`);
      }

      // 3. Listen on SSE for the image
      try {
        const image = await waitForImage(session.id, signal);

        if (ctx.hasUI) ctx.ui.setStatus("glance", undefined);

        if (!image) {
          return {
            content: [{ type: "text", text: `Session timed out. No image was pasted at ${session.url}` }],
            details: { sessionUrl: session.url, error: "timeout" } as GlanceDetails,
          };
        }

        return {
          content: [{ type: "text", text: `Screenshot: ${image.url}` }],
          details: {
            sessionUrl: session.url,
            imageUrl: image.url,
            expiresAt: image.expiresAt,
          } as GlanceDetails,
        };
      } catch (err: any) {
        if (ctx.hasUI) ctx.ui.setStatus("glance", undefined);

        if (signal?.aborted) {
          return {
            content: [{ type: "text", text: "Cancelled" }],
            details: { sessionUrl: session.url, error: "cancelled" } as GlanceDetails,
          };
        }
        return {
          content: [{ type: "text", text: `SSE error: ${err.message}` }],
          details: { sessionUrl: session.url, error: err.message } as GlanceDetails,
          isError: true,
        };
      }
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

async function waitForImage(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ImageEvent | null> {
  const res = await fetch(`${BASE_URL}/api/session/${sessionId}/events`, {
    signal,
    headers: { Accept: "text/event-stream" },
  });

  if (!res.ok || !res.body) {
    throw new Error(`SSE connect failed: HTTP ${res.status}`);
  }

  return new Promise<ImageEvent | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reader.cancel();
      resolve(null);
    }, SSE_TIMEOUT_MS);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    function cleanup() {
      clearTimeout(timeout);
    }

    signal?.addEventListener("abort", () => {
      cleanup();
      reader.cancel();
      reject(new Error("aborted"));
    });

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let eventType = "";
          let dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataLines.push(line.slice(6));
            } else if (line === "") {
              // End of event
              if (eventType === "image" && dataLines.length > 0) {
                const data = JSON.parse(dataLines.join("\n")) as ImageEvent;
                cleanup();
                reader.cancel();
                resolve(data);
                return;
              }
              if (eventType === "timeout" || eventType === "expired") {
                cleanup();
                reader.cancel();
                resolve(null);
                return;
              }
              eventType = "";
              dataLines = [];
            }
          }
        }
        cleanup();
        resolve(null);
      } catch (err) {
        cleanup();
        if (signal?.aborted) {
          reject(new Error("aborted"));
        } else {
          reject(err);
        }
      }
    })();
  });
}
