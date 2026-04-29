/**
 * MCP JSON-RPC transport over stdio using tauri-plugin-shell.
 * Implements Content-Length framing (LSP-style) for message parsing.
 */
import { Command, type Child } from '@tauri-apps/plugin-shell';

export interface JSONRPCMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type MessageHandler = (message: JSONRPCMessage) => void;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class TauriStdioTransport {
  private child: Child | null = null;
  private byteBuffer = new Uint8Array(0);
  private contentLength = -1;
  private onMessage: MessageHandler = () => {};
  private onClose: (() => void) | null = null;

  constructor(
    private config: {
      command: string;
      args: string[];
      env: Record<string, string>;
    },
  ) {}

  setMessageHandler(handler: MessageHandler) {
    this.onMessage = handler;
  }

  setCloseHandler(handler: () => void) {
    this.onClose = handler;
  }

  async start(): Promise<void> {
    // 使用 raw 模式直接收字节：Content-Length framing 按字节计数，
    // 文本模式会按行切分并用 lossy UTF-8 解码，遇跨 chunk 多字节字符时会产生 U+FFFD 替换，
    // 导致帧长度与 Content-Length 不一致。
    const cmd = Command.create(this.config.command, this.config.args, {
      env: this.config.env,
      encoding: 'raw',
    });

    cmd.stdout.on('data', (data: Uint8Array) => this.handleStdout(data));
    cmd.stderr.on('data', (data: Uint8Array) => {
      console.warn('[MCP stderr]', decoder.decode(data));
    });
    cmd.on('close', () => {
      this.child = null;
      this.onClose?.();
    });

    this.child = await cmd.spawn();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.child) throw new Error('Transport not started');
    const json = JSON.stringify(message);
    const bytes = encoder.encode(json).length;
    const frame = `Content-Length: ${bytes}\r\n\r\n${json}`;
    await this.child.write(frame);
  }

  async close(): Promise<void> {
    if (this.child) {
      await this.child.kill();
      this.child = null;
    }
  }

  private handleStdout(incoming: Uint8Array) {
    const merged = new Uint8Array(this.byteBuffer.length + incoming.length);
    merged.set(this.byteBuffer);
    merged.set(incoming, this.byteBuffer.length);
    this.byteBuffer = merged;
    this.parseMessages();
  }

  private static HEADER_SEP = encoder.encode('\r\n\r\n');

  private findHeaderEnd(): number {
    const sep = TauriStdioTransport.HEADER_SEP;
    for (let i = 0; i <= this.byteBuffer.length - sep.length; i++) {
      let match = true;
      for (let j = 0; j < sep.length; j++) {
        if (this.byteBuffer[i + j] !== sep[j]) { match = false; break; }
      }
      if (match) return i;
    }
    return -1;
  }

  private parseMessages() {
    while (true) {
      if (this.contentLength === -1) {
        const headerEnd = this.findHeaderEnd();
        if (headerEnd === -1) return;

        const header = decoder.decode(this.byteBuffer.slice(0, headerEnd));
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.byteBuffer = this.byteBuffer.slice(headerEnd + 4);
          continue;
        }
        this.contentLength = parseInt(match[1], 10);
        this.byteBuffer = this.byteBuffer.slice(headerEnd + 4);
      }

      if (this.byteBuffer.length < this.contentLength) return;

      const body = decoder.decode(this.byteBuffer.slice(0, this.contentLength));
      this.byteBuffer = this.byteBuffer.slice(this.contentLength);
      this.contentLength = -1;

      try {
        const message = JSON.parse(body) as JSONRPCMessage;
        this.onMessage(message);
      } catch (e) {
        console.error('[MCP] Failed to parse JSON-RPC message:', e);
      }
    }
  }
}
