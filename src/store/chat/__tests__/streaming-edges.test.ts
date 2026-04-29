import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { ChatState, StreamingState, ComparisonStreamingState } from '../types';
import { createStreamingSlice } from '../streaming';

const mockInsertMessage = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockUpdateConversationTimestamp = vi.fn().mockResolvedValue({ rowsAffected: 1 });

vi.mock('../../../lib/dao/message-dao', () => ({
  insertMessage: (...args: unknown[]) => mockInsertMessage(...args),
}));
vi.mock('../../../lib/dao/conversation-dao', () => ({
  updateConversationTimestamp: (...args: unknown[]) => mockUpdateConversationTimestamp(...args),
}));
vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../../lib/utils', () => ({
  nowUnix: () => 99999,
}));
vi.mock('../../../lib/search-utils', () => ({
  extractSearchResults: vi.fn(() => []),
}));

function createTestStore() {
  return create<ChatState>((set, get) => ({
    conversations: [],
    activeConversationId: 'conv1',
    messages: [],
    editingMessageId: null,
    hasMoreConversations: false,
    isLoadingMore: false,
    searchResults: null,
    isSearching: false,
    archivedConversations: [],
    autoReadCallback: null,
    ...createStreamingSlice(set, get),
  }) as ChatState);
}

function makeStream(overrides?: Partial<StreamingState>): StreamingState {
  return {
    content: '', thinking: '', messageId: 'msg1',
    abortController: new AbortController(), toolCalls: [],
    ...overrides,
  };
}

describe('streaming slice — edge cases', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
  });

  it('stopStreaming adds message when only thinking exists (no content)', async () => {
    store.getState().setStreaming('conv1', makeStream({ content: '', thinking: '深度思考' }));
    await store.getState().stopStreaming('conv1');
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().messages[0].thinking).toBe('深度思考');
  });

  it('stopStreaming does not add duplicate message', async () => {
    const stream = makeStream({ content: '内容', messageId: 'dup' });
    store.setState({
      messages: [{ id: 'dup', conversation_id: 'conv1', role: 'assistant', content: '已存在', thinking: '', parts: '', token_count: null, rag_results: '', search_results: '', created_at: 1 }],
    });
    store.getState().setStreaming('conv1', stream);
    await store.getState().stopStreaming('conv1');
    // Should not add duplicate
    expect(store.getState().messages).toHaveLength(1);
  });

  it('stopStreaming does not add to store if not active conversation', async () => {
    store.setState({ activeConversationId: 'other' });
    store.getState().setStreaming('conv1', makeStream({ content: '内容' }));
    await store.getState().stopStreaming('conv1');
    expect(store.getState().messages).toHaveLength(0);
  });

  it('stopStreaming handles DB error gracefully', async () => {
    mockInsertMessage.mockRejectedValueOnce(new Error('DB error'));
    store.getState().setStreaming('conv1', makeStream({ content: '内容' }));
    // Should not throw
    await store.getState().stopStreaming('conv1');
  });

  it('updateComparisonStreamThinking patches thinking for specific model', () => {
    const streams = new Map([
      ['modelA', makeStream({ messageId: 'mA' })],
      ['modelB', makeStream({ messageId: 'mB' })],
    ]);
    store.getState().setComparisonStreaming('conv1', { type: 'comparison', streams, finishedKeys: new Set() });

    store.getState().updateComparisonStreamThinking('conv1', 'modelA', '思考A');
    const entry = store.getState().streamingMap.get('conv1') as ComparisonStreamingState;
    expect(entry.streams.get('modelA')!.thinking).toBe('思考A');
    expect(entry.streams.get('modelB')!.thinking).toBe('');
  });

  it('updateComparisonStreamToolCalls patches tool calls', () => {
    const streams = new Map([['modelA', makeStream({ messageId: 'mA' })]]);
    store.getState().setComparisonStreaming('conv1', { type: 'comparison', streams, finishedKeys: new Set() });

    const calls = [{ id: 't1', toolName: 'search' }] as any;
    store.getState().updateComparisonStreamToolCalls('conv1', 'modelA', calls);
    const entry = store.getState().streamingMap.get('conv1') as ComparisonStreamingState;
    expect(entry.streams.get('modelA')!.toolCalls).toEqual(calls);
  });

  it('patchComparisonStream does nothing for non-existent model key', () => {
    const streams = new Map([['modelA', makeStream({ messageId: 'mA' })]]);
    store.getState().setComparisonStreaming('conv1', { type: 'comparison', streams, finishedKeys: new Set() });

    // Should not throw
    store.getState().updateComparisonStreamContent('conv1', 'nonexistent', 'x');
    const entry = store.getState().streamingMap.get('conv1') as ComparisonStreamingState;
    expect(entry.streams.get('modelA')!.content).toBe('');
  });

  it('stopComparisonStreaming skips empty streams', async () => {
    const streams = new Map([
      ['modelA', makeStream({ content: '', thinking: '' })],
      ['modelB', makeStream({ content: '有内容' })],
    ]);
    store.getState().setComparisonStreaming('conv1', { type: 'comparison', streams, finishedKeys: new Set() });

    await store.getState().stopComparisonStreaming('conv1');
    // Only modelB has content, so only 1 message
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().messages[0].content).toBe('有内容');
  });

  it('stopComparisonStreaming handles DB error gracefully', async () => {
    mockInsertMessage.mockRejectedValueOnce(new Error('DB fail'));
    const streams = new Map([['modelA', makeStream({ content: '内容' })]]);
    store.getState().setComparisonStreaming('conv1', { type: 'comparison', streams, finishedKeys: new Set() });

    // Should not throw
    await store.getState().stopComparisonStreaming('conv1');
  });

  it('stopComparisonStreaming does nothing when all streams empty', async () => {
    const streams = new Map([
      ['modelA', makeStream({ content: '', thinking: '' })],
    ]);
    store.getState().setComparisonStreaming('conv1', { type: 'comparison', streams, finishedKeys: new Set() });

    await store.getState().stopComparisonStreaming('conv1');
    expect(store.getState().messages).toHaveLength(0);
    expect(mockInsertMessage).not.toHaveBeenCalled();
  });
});
