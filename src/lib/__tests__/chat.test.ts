import { describe, it, expect, vi } from 'vitest';

vi.mock('../providers', () => ({
  createModel: vi.fn(),
  resolveProvider: vi.fn(),
}));

vi.mock('../model-capabilities', () => ({
  buildThinkingOptions: vi.fn(() => ({})),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
}));

vi.mock('../attachments', () => ({
  resolveImageDataUrl: vi.fn((att) => Promise.resolve(`data:image/png;base64,ABC${att.name}`)),
  guessMediaType: vi.fn((name: string) => {
    if (name.endsWith('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  logApiRequest: vi.fn(),
}));

vi.mock('../message-parts', () => ({
  MEDIA_PART_TYPES: new Set(['image', 'video', 'audio', 'text']),
}));

import { buildModelMessages } from '../chat';
import type { MessageRow } from '../../store/chat';

function makeRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    role: 'user',
    content: 'Hello',
    thinking: '',
    parts: '',
    token_count: null,
    rag_results: '',
    search_results: '',
    created_at: 1700000000,
    ...overrides,
  };
}

describe('buildModelMessages', () => {
  it('converts basic user/assistant messages', async () => {
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'user', content: '你好' }),
      makeRow({ id: '2', role: 'assistant', content: '你好！' }),
    ];
    const result = await buildModelMessages(rows);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'user', content: '你好' });
    expect(result[1]).toEqual({ role: 'assistant', content: '你好！' });
  });

  it('skips system/error roles', async () => {
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'system' as any, content: 'system' }),
      makeRow({ id: '2', role: 'error' as any, content: 'error' }),
      makeRow({ id: '3', role: 'user', content: 'hi' }),
    ];
    const result = await buildModelMessages(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'user', content: 'hi' });
  });

  it('prepends summary as system message', async () => {
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'user', content: 'old msg' }),
      makeRow({ id: '2', role: 'user', content: 'new msg' }),
    ];
    const summary = { content: '之前讨论了...', compressed_count: 1 };
    const result = await buildModelMessages(rows, summary);
    expect(result[0].role).toBe('system');
    expect((result[0] as any).content).toContain('之前对话的摘要');
    expect(result).toHaveLength(2);
  });

  it('handles user message with image attachments', async () => {
    const rows: MessageRow[] = [
      makeRow({
        id: '1', role: 'user', content: '看图',
        attachments: [{ id: 'a1', type: 'image', name: 'photo.png', path: '/p/photo.png' }],
      }),
    ];
    const result = await buildModelMessages(rows);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    const content = (result[0] as any).content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: 'text', text: '看图' });
    expect(content[1].type).toBe('image');
  });

  it('handles user message with file attachments', async () => {
    const rows: MessageRow[] = [
      makeRow({
        id: '1', role: 'user', content: '分析',
        attachments: [{ id: 'a1', type: 'file', name: 'doc.pdf', path: '/p/doc.pdf' }],
      }),
    ];
    const result = await buildModelMessages(rows);
    const content = (result[0] as any).content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[1].type).toBe('file');
    expect(content[1].mediaType).toBe('application/pdf');
    expect(content[1].filename).toBe('doc.pdf');
  });

  it('reconstructs tool call messages from parts', async () => {
    const toolCalls = [
      { id: 'tc1', toolName: 'web-search', args: { q: 'test' }, state: 'result', result: 'found it' },
    ];
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'assistant', content: 'Let me search', parts: JSON.stringify(toolCalls) }),
    ];
    const result = await buildModelMessages(rows);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('assistant');
    const assistantContent = (result[0] as any).content;
    expect(assistantContent[0]).toEqual({ type: 'text', text: 'Let me search' });
    expect(assistantContent[1].type).toBe('tool-call');
    expect(result[1].role).toBe('tool');
  });

  it('handles tool call with error state', async () => {
    const toolCalls = [
      { id: 'tc1', toolName: 'web-search', args: {}, state: 'error', error: 'timeout' },
    ];
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'assistant', content: '', parts: JSON.stringify(toolCalls) }),
    ];
    const result = await buildModelMessages(rows);
    expect(result).toHaveLength(2);
    const toolContent = (result[1] as any).content;
    expect(toolContent[0].output.type).toBe('error-text');
    expect(toolContent[0].output.value).toBe('timeout');
  });

  it('falls through to plain text for invalid parts JSON', async () => {
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'assistant', content: 'plain text', parts: 'not valid json' }),
    ];
    const result = await buildModelMessages(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'assistant', content: 'plain text' });
  });

  it('handles empty rows', async () => {
    const result = await buildModelMessages([]);
    expect(result).toEqual([]);
  });

  it('handles user message without content but with attachments', async () => {
    const rows: MessageRow[] = [
      makeRow({
        id: '1', role: 'user', content: '',
        attachments: [{ id: 'a1', type: 'image', name: 'img.png', path: '/p/img.png' }],
      }),
    ];
    const result = await buildModelMessages(rows);
    const content = (result[0] as any).content;
    expect(content[0].type).toBe('image');
  });

  it('handles mixed image and file attachments', async () => {
    const rows: MessageRow[] = [
      makeRow({
        id: '1', role: 'user', content: '分析这些',
        attachments: [
          { id: 'a1', type: 'image', name: 'pic.png', path: '/p/pic.png' },
          { id: 'a2', type: 'file', name: 'data.csv', path: '/p/data.csv' },
        ],
      }),
    ];
    const result = await buildModelMessages(rows);
    const content = (result[0] as any).content;
    expect(content).toHaveLength(3); // text + image + file
    expect(content[0].type).toBe('text');
    expect(content[1].type).toBe('image');
    expect(content[2].type).toBe('file');
  });

  it('skips rows within compressed_count when summary provided', async () => {
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'user', content: '旧消息1' }),
      makeRow({ id: '2', role: 'assistant', content: '旧回复1' }),
      makeRow({ id: '3', role: 'user', content: '新消息' }),
    ];
    const summary = { content: '之前讨论了旧话题', compressed_count: 2 };
    const result = await buildModelMessages(rows, summary);
    expect(result).toHaveLength(2);
    expect((result[1] as any).content).toBe('新消息');
  });

  it('handles tool call in calling state (no result)', async () => {
    const toolCalls = [
      { id: 'tc1', toolName: 'calculator', args: { expr: '1+1' }, state: 'calling' },
    ];
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'assistant', content: '', parts: JSON.stringify(toolCalls) }),
    ];
    const result = await buildModelMessages(rows);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
  });

  it('handles media parts in assistant message (falls through to plain text)', async () => {
    // Media parts (image/video/audio) should NOT be treated as tool calls
    const mediaParts = [{ type: 'image', path: '/img.png', mediaType: 'image/png' }];
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'assistant', content: '生成了图片', parts: JSON.stringify(mediaParts) }),
    ];
    const result = await buildModelMessages(rows);
    // Should fall through to plain text since first part type is in MEDIA_PART_TYPES
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'assistant', content: '生成了图片' });
  });
});
