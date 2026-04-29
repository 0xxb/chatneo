import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @tauri-apps/plugin-shell
const mockStdoutOn = vi.fn();
const mockStderrOn = vi.fn();
const mockOn = vi.fn();
const mockSpawn = vi.fn();
const mockWrite = vi.fn().mockResolvedValue(undefined);
const mockKill = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    create: vi.fn(() => {
      const cmd = {
        stdout: { on: mockStdoutOn },
        stderr: { on: mockStderrOn },
        on: mockOn,
        spawn: mockSpawn,
      };
      mockSpawn.mockResolvedValue({ write: mockWrite, kill: mockKill });
      return cmd;
    }),
  },
}));

import { TauriStdioTransport, type JSONRPCMessage } from '../mcp-stdio-transport';

const encoder = new TextEncoder();

function makeFrame(obj: object): Uint8Array {
  const json = JSON.stringify(obj);
  const bytes = encoder.encode(json);
  const frame = `Content-Length: ${bytes.length}\r\n\r\n${json}`;
  return encoder.encode(frame);
}

describe('TauriStdioTransport', () => {
  let transport: TauriStdioTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new TauriStdioTransport({
      command: 'node',
      args: ['server.js'],
      env: { FOO: 'bar' },
    });
  });

  describe('start', () => {
    it('spawns the command and sets up event handlers', async () => {
      await transport.start();
      const { Command } = await import('@tauri-apps/plugin-shell');
      expect(Command.create).toHaveBeenCalledWith('node', ['server.js'], {
        env: { FOO: 'bar' },
        encoding: 'raw',
      });
      expect(mockStdoutOn).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockStderrOn).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('send', () => {
    it('throws if not started', async () => {
      await expect(transport.send({ jsonrpc: '2.0', method: 'test' })).rejects.toThrow('Transport not started');
    });

    it('writes Content-Length framed message', async () => {
      await transport.start();
      const msg: JSONRPCMessage = { jsonrpc: '2.0', id: 1, method: 'ping' };
      await transport.send(msg);

      const json = JSON.stringify(msg);
      const bytes = encoder.encode(json).length;
      expect(mockWrite).toHaveBeenCalledWith(`Content-Length: ${bytes}\r\n\r\n${json}`);
    });
  });

  describe('close', () => {
    it('kills the child process', async () => {
      await transport.start();
      await transport.close();
      expect(mockKill).toHaveBeenCalled();
    });

    it('is safe to call when not started', async () => {
      await transport.close(); // should not throw
    });
  });

  describe('message parsing', () => {
    it('parses a single complete message', async () => {
      const handler = vi.fn();
      transport.setMessageHandler(handler);
      await transport.start();

      const stdoutHandler = mockStdoutOn.mock.calls.find(c => c[0] === 'data')![1];
      const msg = { jsonrpc: '2.0', id: 1, result: 'ok' };
      stdoutHandler(makeFrame(msg));

      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('parses multiple messages in one chunk', async () => {
      const handler = vi.fn();
      transport.setMessageHandler(handler);
      await transport.start();

      const stdoutHandler = mockStdoutOn.mock.calls.find(c => c[0] === 'data')![1];
      const msg1 = { jsonrpc: '2.0', id: 1, result: 'a' };
      const msg2 = { jsonrpc: '2.0', id: 2, result: 'b' };
      const combined = new Uint8Array([...makeFrame(msg1), ...makeFrame(msg2)]);
      stdoutHandler(combined);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(msg1);
      expect(handler).toHaveBeenCalledWith(msg2);
    });

    it('handles message split across multiple chunks', async () => {
      const handler = vi.fn();
      transport.setMessageHandler(handler);
      await transport.start();

      const stdoutHandler = mockStdoutOn.mock.calls.find(c => c[0] === 'data')![1];
      const msg = { jsonrpc: '2.0', id: 1, result: 'hello' };
      const frame = makeFrame(msg);
      const mid = Math.floor(frame.length / 2);

      stdoutHandler(frame.slice(0, mid));
      expect(handler).not.toHaveBeenCalled();

      stdoutHandler(frame.slice(mid));
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('handles header split from body', async () => {
      const handler = vi.fn();
      transport.setMessageHandler(handler);
      await transport.start();

      const stdoutHandler = mockStdoutOn.mock.calls.find(c => c[0] === 'data')![1];
      const msg = { jsonrpc: '2.0', method: 'notify' };
      const json = JSON.stringify(msg);
      const bytes = encoder.encode(json).length;

      // Send header separately
      stdoutHandler(encoder.encode(`Content-Length: ${bytes}\r\n\r\n`));
      expect(handler).not.toHaveBeenCalled();

      // Send body
      stdoutHandler(encoder.encode(json));
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('handles multibyte UTF-8 content correctly', async () => {
      const handler = vi.fn();
      transport.setMessageHandler(handler);
      await transport.start();

      const stdoutHandler = mockStdoutOn.mock.calls.find(c => c[0] === 'data')![1];
      const msg = { jsonrpc: '2.0', id: 1, result: '你好世界' };
      stdoutHandler(makeFrame(msg));

      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('skips invalid header without Content-Length', async () => {
      const handler = vi.fn();
      transport.setMessageHandler(handler);
      await transport.start();

      const stdoutHandler = mockStdoutOn.mock.calls.find(c => c[0] === 'data')![1];
      // Send garbage header followed by valid message
      const garbage = encoder.encode('Invalid-Header: foo\r\n\r\n');
      const msg = { jsonrpc: '2.0', id: 1, result: 'ok' };
      const combined = new Uint8Array([...garbage, ...makeFrame(msg)]);
      stdoutHandler(combined);

      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('handles invalid JSON body gracefully', async () => {
      const handler = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      transport.setMessageHandler(handler);
      await transport.start();

      const stdoutHandler = mockStdoutOn.mock.calls.find(c => c[0] === 'data')![1];
      const badJson = '{invalid json}';
      const bytes = encoder.encode(badJson).length;
      const frame = encoder.encode(`Content-Length: ${bytes}\r\n\r\n${badJson}`);
      stdoutHandler(frame);

      expect(handler).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('close handler', () => {
    it('invokes close handler when child exits', async () => {
      const closeHandler = vi.fn();
      transport.setCloseHandler(closeHandler);
      await transport.start();

      const onClose = mockOn.mock.calls.find(c => c[0] === 'close')![1];
      onClose();

      expect(closeHandler).toHaveBeenCalled();
    });
  });
});
