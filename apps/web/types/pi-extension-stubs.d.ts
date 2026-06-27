declare module '@mariozechner/pi-ai' {
  export const Type: {
    Object<T extends Record<string, unknown>>(shape: T): {
      type: 'object';
      shape: T;
    };
  };
}

declare module '@mariozechner/pi-tui' {
  export class Text {
    constructor(text: string, x: number, y: number);
    text: string;
    x: number;
    y: number;
  }
}

declare module '@mariozechner/pi-coding-agent' {
  export interface ExtensionAPI {
    on(event: string, handler: (...args: any[]) => any): void;
    registerCommand(name: string, definition: any): void;
    registerTool(definition: any): void;
    sendUserMessage(message: string, options?: { deliverAs?: string }): void;
  }
}
