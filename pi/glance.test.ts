import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import glanceExtension, { __testing } from "./glance";

interface SessionResponse {
  id: string;
  url: string;
}

interface ImageEvent {
  url: string;
  expiresAt: number;
}

interface CommandContext {
  ui: {
    notify: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
  };
}

interface ToolContext extends CommandContext {
  hasUI: boolean;
}

type CommandDefinition = {
  description: string;
  handler: (args: string[], ctx: CommandContext) => Promise<void>;
};

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
};

type ToolDefinition = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: Record<string, never>,
    signal: AbortSignal | undefined,
    onUpdate: ((result: ToolResult) => void) | undefined,
    ctx: ToolContext,
  ) => Promise<ToolResult>;
  renderCall: (args: unknown, theme: Theme) => { text: string };
  renderResult: (
    result: ToolResult,
    options: unknown,
    theme: Theme,
  ) => { text: string };
};

interface Theme {
  bold(text: string): string;
  fg(color: string, text: string): string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      headers: { "content-type": "text/event-stream" },
      status: 200,
    },
  );
}

function pendingSseResponse(signal?: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener(
      "abort",
      () => {
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function createCommandContext(): CommandContext {
  return {
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
    },
  };
}

function createToolContext(hasUI = true): ToolContext {
  return {
    hasUI,
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
    },
  };
}

function createTheme(): Theme {
  return {
    bold(text) {
      return `**${text}**`;
    },
    fg(color, text) {
      return `[${color}]${text}`;
    },
  };
}

function createPi(options?: { autoShutdownOnMessage?: boolean }) {
  const events = new Map<string, (...args: any[]) => unknown>();
  const commands = new Map<string, CommandDefinition>();
  let tool: ToolDefinition | null = null;

  const api = {
    on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
      events.set(event, handler);
    }),
    registerCommand: vi.fn((name: string, definition: CommandDefinition) => {
      commands.set(name, definition);
    }),
    registerTool: vi.fn((definition: ToolDefinition) => {
      tool = definition;
    }),
    sendUserMessage: vi.fn((message: string, payload?: { deliverAs?: string }) => {
      if (options?.autoShutdownOnMessage) {
        void emit("session_shutdown");
      }
      return { message, payload };
    }),
  };

  async function emit(event: string, ...args: any[]) {
    const handler = events.get(event);
    if (!handler) {
      throw new Error(`Missing handler for ${event}`);
    }
    return await handler(...args);
  }

  return {
    api,
    commands,
    emit,
    getTool() {
      if (!tool) {
        throw new Error("Tool not registered");
      }
      return tool;
    },
  };
}

describe("pi/glance", () => {
  beforeEach(() => {
    __testing.resetState();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    __testing.resetState();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("creates sessions and marks them stale after the refresh window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T15:00:00.000Z"));

    const session = {
      id: "session-1",
      url: "/s/session-1",
    } satisfies SessionResponse;

    const fetchMock = vi.fn(async () => jsonResponse(session));
    vi.stubGlobal("fetch", fetchMock);

    await expect(__testing.createSession()).resolves.toEqual({
      ...session,
      url: "https://glance.sh/s/session-1",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://glance.sh/api/session", {
      method: "POST",
    });
    expect(__testing.getState().currentSession).toEqual({
      ...session,
      url: "https://glance.sh/s/session-1",
    });
    expect(__testing.isSessionStale()).toBe(false);

    vi.setSystemTime(new Date("2026-03-07T15:08:00.001Z"));
    expect(__testing.isSessionStale()).toBe(true);
  });

  it("parses image SSE events and clears the session on expiry", async () => {
    const session = {
      id: "session-2",
      url: "https://glance.sh/s/session-2",
    } satisfies SessionResponse;
    const image = {
      url: "https://cdn.glance.sh/image-1.png",
      expiresAt: 123,
    } satisfies ImageEvent;

    __testing.setSession(session);

    const fetchMock = vi.fn(async () =>
      sseResponse([
        'event: image\ndata: {"url":"https://cdn.glance.sh/image-1.png",',
        '"expiresAt":123}\n\n',
        "event: expired\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onImage = vi.fn();

    await __testing.listenForImages(session.id, new AbortController().signal, onImage);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://glance.sh/api/session/${session.id}/events`,
      {
        headers: { Accept: "text/event-stream" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(onImage).toHaveBeenCalledWith(image);
    expect(__testing.getState().currentSession).toBeNull();
  });

  it("starts the background listener on session_start and forwards pasted images", async () => {
    const session = {
      id: "session-3",
      url: "https://glance.sh/s/session-3",
    } satisfies SessionResponse;
    const image = {
      url: "https://cdn.glance.sh/image-2.png",
      expiresAt: 456,
    } satisfies ImageEvent;

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url === "https://glance.sh/api/session") {
        return jsonResponse(session);
      }

      if (url === `https://glance.sh/api/session/${session.id}/events`) {
        return sseResponse([
          `event: image\ndata: ${JSON.stringify(image)}\n\n`,
        ]);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const pi = createPi({ autoShutdownOnMessage: true });
    glanceExtension(pi.api as never);

    await pi.emit("session_start");

    await vi.waitFor(() => {
      expect(pi.api.sendUserMessage).toHaveBeenCalledWith(
        `Screenshot: ${image.url}`,
        { deliverAs: "followUp" },
      );
    });

    await vi.waitFor(() => {
      expect(__testing.getState().running).toBe(false);
    });
  });

  it("shows the active session URL through the /glance command", async () => {
    const session = {
      id: "session-4",
      url: "https://glance.sh/s/session-4",
    } satisfies SessionResponse;

    __testing.setSession(session);
    vi.stubGlobal("fetch", vi.fn());

    const pi = createPi();
    glanceExtension(pi.api as never);

    const ctx = createCommandContext();
    await pi.commands.get("glance")!.handler([], ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      `Paste screenshots at ${session.url}`,
      "info",
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("creates a session through the /glance command when none exists", async () => {
    const session = {
      id: "session-4b",
      url: "https://glance.sh/s/session-4b",
    } satisfies SessionResponse;

    const fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "https://glance.sh/api/session") {
        return Promise.resolve(jsonResponse(session));
      }

      if (url === `https://glance.sh/api/session/${session.id}/events`) {
        return pendingSseResponse(init?.signal as AbortSignal | undefined);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const pi = createPi();
    glanceExtension(pi.api as never);

    const ctx = createCommandContext();
    await pi.commands.get("glance")!.handler([], ctx);

    expect(ctx.ui.notify).toHaveBeenNthCalledWith(
      1,
      "No active glance session — starting one…",
      "info",
    );
    expect(ctx.ui.notify).toHaveBeenNthCalledWith(
      2,
      `Paste screenshots at ${session.url}`,
      "info",
    );

    __testing.stopBackground();
    await vi.waitFor(() => {
      expect(__testing.getState().running).toBe(false);
    });
  });

  it("waits for the next image in the glance tool and returns its URL", async () => {
    const session = {
      id: "session-5",
      url: "https://glance.sh/s/session-5",
    } satisfies SessionResponse;
    const image = {
      url: "https://cdn.glance.sh/image-3.png",
      expiresAt: 789,
    } satisfies ImageEvent;

    __testing.setSession(session);

    const pi = createPi();
    glanceExtension(pi.api as never);

    const tool = pi.getTool();
    const ctx = createToolContext();
    const onUpdate = vi.fn();

    const resultPromise = tool.execute(
      "tool-1",
      {},
      undefined,
      onUpdate,
      ctx,
    );

    await Promise.resolve();
    __testing.dispatchToWaiters(image);

    const result = await resultPromise;

    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: `Waiting for image at ${session.url}` }],
      details: { sessionUrl: session.url },
    });
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      `Open ${session.url} and paste an image`,
      "info",
    );
    expect(ctx.ui.setStatus).toHaveBeenCalledWith(
      "glance",
      `👁 Waiting for paste at ${session.url}`,
    );
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("glance", undefined);
    expect(result).toEqual({
      content: [{ type: "text", text: `Screenshot: ${image.url}` }],
      details: {
        expiresAt: image.expiresAt,
        imageUrl: image.url,
        sessionUrl: session.url,
      },
    });
  });

  it("returns a timeout result when no image arrives before the wait window closes", async () => {
    vi.useFakeTimers();

    const session = {
      id: "session-6",
      url: "https://glance.sh/s/session-6",
    } satisfies SessionResponse;

    __testing.setSession(session);

    const pi = createPi();
    glanceExtension(pi.api as never);

    const resultPromise = pi.getTool().execute(
      "tool-2",
      {},
      undefined,
      vi.fn(),
      createToolContext(),
    );

    await vi.advanceTimersByTimeAsync(305_000);

    await expect(resultPromise).resolves.toEqual({
      content: [{
        type: "text",
        text: `Session timed out. Paste an image at ${session.url}`,
      }],
      details: {
        error: "timeout",
        sessionUrl: session.url,
      },
    });
  });

  it("creates a session for the tool and returns a cancelled result on abort", async () => {
    const session = {
      id: "session-6b",
      url: "https://glance.sh/s/session-6b",
    } satisfies SessionResponse;

    const fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "https://glance.sh/api/session") {
        return Promise.resolve(jsonResponse(session));
      }

      if (url === `https://glance.sh/api/session/${session.id}/events`) {
        return pendingSseResponse(init?.signal as AbortSignal | undefined);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const pi = createPi();
    glanceExtension(pi.api as never);

    const signal = new AbortController();
    const ctx = createToolContext();
    const onUpdate = vi.fn();
    const resultPromise = pi.getTool().execute(
      "tool-2b",
      {},
      signal.signal,
      onUpdate,
      ctx,
    );

    await vi.waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({
        content: [{ type: "text", text: `Waiting for image at ${session.url}` }],
        details: { sessionUrl: session.url },
      });
    });
    signal.abort();

    await expect(resultPromise).resolves.toEqual({
      content: [{ type: "text", text: "Cancelled" }],
      details: {
        error: "cancelled",
        sessionUrl: session.url,
      },
    });

    __testing.stopBackground();
    await vi.waitFor(() => {
      expect(__testing.getState().running).toBe(false);
    });
  });

  it("returns an error result when session creation fails", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "bad" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    const pi = createPi();
    glanceExtension(pi.api as never);

    const result = await pi.getTool().execute(
      "tool-3",
      {},
      undefined,
      vi.fn(),
      createToolContext(false),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      content: [{ type: "text", text: "Failed to create session: HTTP 500" }],
      details: { error: "HTTP 500" },
      isError: true,
    });
  });

  it("throws when the SSE connection cannot be established", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));

    await expect(
      __testing.listenForImages(
        "missing-session",
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow("SSE connect failed: HTTP 503");
  });

  it("renders call and result states for the tool", () => {
    const pi = createPi();
    glanceExtension(pi.api as never);

    const tool = pi.getTool();
    const theme = createTheme();

    expect(tool.renderCall({}, theme).text).toContain("waiting for screenshot");
    expect(
      tool.renderResult(
        {
          content: [{ type: "text", text: "fallback text" }],
          details: { error: "timeout" },
        },
        undefined,
        theme,
      ).text,
    ).toContain("timeout");
    expect(
      tool.renderResult(
        {
          content: [{ type: "text", text: "fallback text" }],
          details: { imageUrl: "https://cdn.glance.sh/image-4.png" },
        },
        undefined,
        theme,
      ).text,
    ).toContain("https://cdn.glance.sh/image-4.png");
    expect(
      tool.renderResult(
        {
          content: [{ type: "text", text: "fallback text" }],
          details: { sessionUrl: "https://glance.sh/s/session-7" },
        },
        undefined,
        theme,
      ).text,
    ).toContain("https://glance.sh/s/session-7");
    expect(
      tool.renderResult(
        { content: [{ type: "text", text: "fallback text" }] },
        undefined,
        theme,
      ).text,
    ).toContain("fallback text");
  });
});
