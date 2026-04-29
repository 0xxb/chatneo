import { describe, it, expect, vi } from 'vitest';
import { dbMessagesToDisplayMessages, formatErrorDetail } from '../chat-persistence';
import type { MessageRow } from '../../store/chat';

vi.mock('../utils', () => ({
  safeJsonParse: <T>(str: string, fallback: T): T => {
    try { return JSON.parse(str); } catch { return fallback; }
  },
  sanitizeErrorDetail: (s: string) => s,
  nowUnix: () => 1700000000,
}));

vi.mock('../message-parts', () => ({
  parseMessageParts: (json: string) => {
    try {
      const parts = JSON.parse(json);
      if (Array.isArray(parts) && parts.length > 0 && ['image', 'video', 'audio', 'text'].includes(parts[0].type)) {
        return parts;
      }
    } catch {}
    return [];
  },
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

function makeRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    role: 'assistant',
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

describe('dbMessagesToDisplayMessages', () => {
  it('converts basic user and assistant messages', () => {
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'user', content: '你好' }),
      makeRow({ id: '2', role: 'assistant', content: '你好！' }),
    ];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('你好');
    expect(result[1].role).toBe('assistant');
    expect(result[1].content).toBe('你好！');
  });

  it('filters out non-user/assistant/error roles', () => {
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'system' as any, content: 'system prompt' }),
      makeRow({ id: '2', role: 'user', content: 'hi' }),
    ];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('parses tool calls from parts JSON', () => {
    const toolCalls = [{ id: 'tc1', toolName: 'web-search', args: { q: 'test' }, state: 'result', result: 'found' }];
    const rows: MessageRow[] = [
      makeRow({ id: '1', parts: JSON.stringify(toolCalls) }),
    ];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result[0].toolCalls).toBeDefined();
    expect(result[0].toolCalls![0].toolName).toBe('web-search');
  });

  it('parses media parts from parts JSON', () => {
    const mediaParts = [{ type: 'image', path: '/path/img.png' }];
    const rows: MessageRow[] = [
      makeRow({ id: '1', parts: JSON.stringify(mediaParts) }),
    ];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result[0].mediaParts).toBeDefined();
    expect(result[0].mediaParts![0].type).toBe('image');
  });

  it('parses token usage from token_count', () => {
    const usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150, duration: 1000 };
    const rows: MessageRow[] = [
      makeRow({ id: '1', token_count: JSON.stringify(usage) }),
    ];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result[0].usage).toEqual(usage);
  });

  it('parses search results and accumulates across messages', () => {
    const search1 = [{ title: 'Result 1', url: 'https://a.com', snippet: 'aaa' }];
    const search2 = [{ title: 'Result 2', url: 'https://b.com', snippet: 'bbb' }];
    const rows: MessageRow[] = [
      makeRow({ id: '1', search_results: JSON.stringify(search1) }),
      makeRow({ id: '2', search_results: JSON.stringify(search2) }),
    ];
    const result = dbMessagesToDisplayMessages(rows);
    // Second message should have accumulated search results
    expect(result[1].searchResults).toHaveLength(2);
    expect(result[0].searchResults).toHaveLength(1);
  });

  it('handles empty parts gracefully', () => {
    const rows: MessageRow[] = [makeRow({ id: '1', parts: '' })];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result[0].toolCalls).toBeUndefined();
    expect(result[0].mediaParts).toBeUndefined();
  });

  it('handles invalid parts JSON gracefully', () => {
    const rows: MessageRow[] = [makeRow({ id: '1', parts: 'not json' })];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result[0].toolCalls).toBeUndefined();
  });

  it('includes error messages', () => {
    const rows: MessageRow[] = [
      makeRow({ id: '1', role: 'error', content: 'Something failed' }),
    ];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('error');
  });

  it('maps attachments for display', () => {
    const rows: MessageRow[] = [
      makeRow({
        id: '1', role: 'user',
        attachments: [{ id: 'a1', type: 'image', name: 'pic.png', path: '/p', preview: 'data:...' }],
      }),
    ];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result[0].attachments).toHaveLength(1);
    expect(result[0].attachments![0].name).toBe('pic.png');
  });

  it('handles empty messages array', () => {
    const result = dbMessagesToDisplayMessages([]);
    expect(result).toEqual([]);
  });

  it('handles null rag_results gracefully', () => {
    const rows: MessageRow[] = [makeRow({ id: '1', rag_results: '' })];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result[0].ragResults).toBeUndefined();
  });

  it('parses rag results when present', () => {
    const rag = [{ chunk_id: 1, document_id: 'd1', content: 'ctx', position: 0, distance: 0.1, document_name: 'Doc', document_type: 'pdf' }];
    const rows: MessageRow[] = [makeRow({ id: '1', rag_results: JSON.stringify(rag) })];
    const result = dbMessagesToDisplayMessages(rows);
    expect(result[0].ragResults).toHaveLength(1);
    expect(result[0].ragResults![0].document_name).toBe('Doc');
  });
});

describe('formatErrorDetail', () => {
  it('formats a simple error', () => {
    const err = new Error('Something went wrong');
    const result = formatErrorDetail(err);
    expect(result).toContain('Something went wrong');
  });

  it('includes extra properties in JSON', () => {
    const err = new Error('fail') as any;
    err.statusCode = 429;
    err.retryAfter = 30;
    const result = formatErrorDetail(err);
    expect(result).toContain('fail');
    expect(result).toContain('429');
    expect(result).toContain('30');
  });

  it('handles error with no extra properties', () => {
    const err = new Error('plain error');
    const result = formatErrorDetail(err);
    expect(result).toBe('plain error');
  });
});
