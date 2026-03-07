export interface UI {
  notify(message: string, level: "error" | "info"): void;
  setStatus(name: string, status: string | undefined): void;
}

export interface CommandContext {
  ui: UI;
}

export interface ToolContext extends CommandContext {
  hasUI: boolean;
}

export interface ToolResult {
  content: Array<{
    text: string;
    type: "text";
  }>;
  details?: unknown;
  isError?: boolean;
}

export interface Theme {
  bold(text: string): string;
  fg(color: string, text: string): string;
}

export interface CommandDefinition {
  description: string;
  handler(args: string[], ctx: CommandContext): Promise<void> | void;
}

export interface ToolDefinition {
  description: string;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: ((result: ToolResult) => void) | undefined,
    ctx: ToolContext,
  ): Promise<ToolResult>;
  label: string;
  name: string;
  parameters: unknown;
  renderCall(args: unknown, theme: Theme): unknown;
  renderResult(result: ToolResult, options: unknown, theme: Theme): unknown;
}

export interface ExtensionAPI {
  on(
    event: "session_shutdown" | "session_start",
    handler: () => Promise<void> | void,
  ): void;
  registerCommand(name: string, definition: CommandDefinition): void;
  registerTool(definition: ToolDefinition): void;
  sendUserMessage(
    message: string,
    options?: {
      deliverAs?: "followUp" | string;
    },
  ): void;
}
