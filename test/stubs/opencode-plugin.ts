export interface ToolContext {
  abort?: AbortSignal;
  metadata(input: {
    metadata: Record<string, unknown>;
    title: string;
  }): void;
}

export interface ToolDefinition {
  args: Record<string, unknown>;
  description: string;
  execute(...args: any[]): Promise<string> | string;
}

export type Plugin = (input: {
  client: unknown;
}) => Promise<{
  event?: (input: { event: { type: string } }) => Promise<void> | void;
  tool: Record<string, ToolDefinition>;
}>;

export function tool<T extends ToolDefinition>(definition: T): T {
  return definition;
}
