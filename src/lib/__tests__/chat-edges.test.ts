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
  guessMediaType: vi.fn(() => 'application/octet-stream'),
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
    id: 'msg-1', conversation_id: 'conv-1', role: 'user', content: 'Hello',
    thinking: '', parts: '', token_count: null, rag_results: '', search_results: '',
    created_at: 1700000000, ...overrides,
  };
}

describe('buildModelMessages — edge cases', () => {
  it('handles tool call result as object (non-string)', async () => {
    const toolCalls = [{
      id: 'tc1', toolName: 'calc', args: { expr: '1+1' },
      state: 'result', result: { answer: 2, unit: 'none' },
    }];
    const rows = [makeRow({ id: '1', role: 'assistant', content: '', parts: JSON.stringify(toolCalls) })];
    const result = await buildModelMessages(rows);

    expect(result).toHaveLength(2);
    const toolContent = (result[1] as any).content;
    expect(toolContent[0].output.type).toBe('json');
    expect(toolContent[0].output.value).toEqual({ answer: 2, unit: 'none' });
  });

  it('handles tool call result as null (falls back to empty object)', async () => {
    const toolCalls = [{
      id: 'tc1', toolName: 'search', args: {}, state: 'result', result: null,
    }];
    const rows = [makeRow({ id: '1', role: 'assistant', content: '', parts: JSON.stringify(toolCalls) })];
    const result = await buildModelMessages(rows);

    const toolContent = (result[1] as any).content;
    expect(toolContent[0].output.type).toBe('json');
    expect(toolContent[0].output.value).toEqual({});
  });

  it('handles tool call error without explicit error message', async () => {
    const toolCalls = [{
      id: 'tc1', toolName: 'search', args: {}, state: 'error',
      // no error property — should fallback to 'Tool call failed'
    }];
    const rows = [makeRow({ id: '1', role: 'assistant', content: '', parts: JSON.stringify(toolCalls) })];
    const result = await buildModelMessages(rows);

    const toolContent = (result[1] as any).content;
    expect(toolContent[0].output.type).toBe('error-text');
    expect(toolContent[0].output.value).toBe('Tool call failed');
  });

  it('handles existing tool call updated with new args', async () => {
    // Simulates a case where the same tool call ID appears twice (update scenario)
    const toolCalls = [
      { id: 'tc1', toolName: 'search', args: { q: 'initial' }, state: 'calling' },
      { id: 'tc1', toolName: 'search', args: { q: 'updated' }, state: 'result', result: 'found' },
    ];
    const rows = [makeRow({ id: '1', role: 'assistant', content: 'text', parts: JSON.stringify(toolCalls) })];
    const result = await buildModelMessages(rows);

    // Should have assistant + tool messages
    expect(result).toHaveLength(2);
    const assistantContent = (result[0] as any).content;
    // Two tool-call parts (one per entry in the array)
    const toolCallParts = assistantContent.filter((p: any) => p.type === 'tool-call');
    expect(toolCallParts).toHaveLength(2);
  });

  it('handles summary with compressed_count exceeding rows length', async () => {
    const rows = [makeRow({ id: '1', role: 'user', content: 'only msg' })];
    const summary = { content: '摘要', compressed_count: 100 };
    const result = await buildModelMessages(rows, summary);
    // system message for summary, but all rows skipped
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('system');
  });
});
