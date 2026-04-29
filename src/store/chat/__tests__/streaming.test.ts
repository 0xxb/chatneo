import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { ChatState, StreamingState, ComparisonStreamingState } from '../types';
import { createStreamingSlice } from '../streaming';

vi.mock('../../../lib/dao/message-dao', () => ({
  insertMessage: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
}));
vi.mock('../../../lib/dao/conversation-dao', () => ({
  updateConversationTimestamp: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
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

describe('streaming slice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  function makeStream(overrides?: Partial<StreamingState>): StreamingState {
    return {
      content: '',
      thinking: '',
      messageId: 'msg1',
      abortController: new AbortController(),
      toolCalls: [],
      ...overrides,
    };
  }

  describe('setStreaming', () => {
    it('sets streaming state', () => {
      const stream = makeStream();
      store.getState().setStreaming('conv1', stream);
      expect(store.getState().streamingMap.get('conv1')).toBe(stream);
    });

    it('clears streaming state', () => {
      store.getState().setStreaming('conv1', makeStream());
      store.getState().setStreaming('conv1', null);
      expect(store.getState().streamingMap.has('conv1')).toBe(false);
    });
  });

  describe('updateStreamingContent', () => {
    it('patches content', () => {
      store.getState().setStreaming('conv1', makeStream());
      store.getState().updateStreamingContent('conv1', 'Hello world');
      const entry = store.getState().streamingMap.get('conv1') as StreamingState;
      expect(entry.content).toBe('Hello world');
    });

    it('does nothing for comparison streaming', () => {
      const comparison: ComparisonStreamingState = {
        type: 'comparison',
        streams: new Map(),
        finishedKeys: new Set(),
      };
      store.getState().setComparisonStreaming('conv1', comparison);
      store.getState().updateStreamingContent('conv1', 'ignored');
      const entry = store.getState().streamingMap.get('conv1') as ComparisonStreamingState;
      expect(entry.type).toBe('comparison');
    });
  });

  describe('updateStreamingThinking', () => {
    it('patches thinking', () => {
      store.getState().setStreaming('conv1', makeStream());
      store.getState().updateStreamingThinking('conv1', '思考中...');
      const entry = store.getState().streamingMap.get('conv1') as StreamingState;
      expect(entry.thinking).toBe('思考中...');
    });
  });

  describe('updateStreamingToolCalls', () => {
    it('patches tool calls', () => {
      store.getState().setStreaming('conv1', makeStream());
      const calls: import('../../../lib/tool-call-types').ToolCallData[] = [{ id: 't1', toolName: 'search', args: {}, state: 'calling' }];
      store.getState().updateStreamingToolCalls('conv1', calls);
      const entry = store.getState().streamingMap.get('conv1') as StreamingState;
      expect(entry.toolCalls).toEqual(calls);
    });
  });

  describe('stopStreaming', () => {
    it('aborts controller and clears map', async () => {
      const ac = new AbortController();
      const stream = makeStream({ content: '部分内容', abortController: ac });
      store.getState().setStreaming('conv1', stream);

      await store.getState().stopStreaming('conv1');
      expect(ac.signal.aborted).toBe(true);
      expect(store.getState().streamingMap.has('conv1')).toBe(false);
    });

    it('adds message to state when content exists', async () => {
      store.getState().setStreaming('conv1', makeStream({ content: '有内容' }));
      await store.getState().stopStreaming('conv1');
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0].content).toBe('有内容');
      expect(store.getState().messages[0].role).toBe('assistant');
    });

    it('does not add message when content is empty', async () => {
      store.getState().setStreaming('conv1', makeStream({ content: '', thinking: '' }));
      await store.getState().stopStreaming('conv1');
      expect(store.getState().messages).toHaveLength(0);
    });

    it('does nothing for non-existent convId', async () => {
      await store.getState().stopStreaming('nonexistent');
      expect(store.getState().messages).toHaveLength(0);
    });
  });

  describe('comparison streaming', () => {
    it('setComparisonStreaming sets and clears', () => {
      const state: ComparisonStreamingState = {
        type: 'comparison',
        streams: new Map([['model1', makeStream({ messageId: 'm1' })]]),
        finishedKeys: new Set(),
      };
      store.getState().setComparisonStreaming('conv1', state);
      expect((store.getState().streamingMap.get('conv1') as ComparisonStreamingState).type).toBe('comparison');

      store.getState().setComparisonStreaming('conv1', null);
      expect(store.getState().streamingMap.has('conv1')).toBe(false);
    });

    it('updateComparisonStreamContent patches specific model', () => {
      const streams = new Map([
        ['modelA', makeStream({ messageId: 'mA' })],
        ['modelB', makeStream({ messageId: 'mB' })],
      ]);
      store.getState().setComparisonStreaming('conv1', { type: 'comparison', streams, finishedKeys: new Set() });

      store.getState().updateComparisonStreamContent('conv1', 'modelA', '内容A');
      const entry = store.getState().streamingMap.get('conv1') as ComparisonStreamingState;
      expect(entry.streams.get('modelA')!.content).toBe('内容A');
      expect(entry.streams.get('modelB')!.content).toBe('');
    });

    it('stopComparisonStreaming aborts all and saves messages', async () => {
      const acA = new AbortController();
      const acB = new AbortController();
      const streams = new Map([
        ['modelA', makeStream({ messageId: 'mA', content: '回复A', abortController: acA })],
        ['modelB', makeStream({ messageId: 'mB', content: '回复B', abortController: acB })],
      ]);
      store.getState().setComparisonStreaming('conv1', { type: 'comparison', streams, finishedKeys: new Set() });

      await store.getState().stopComparisonStreaming('conv1');
      expect(acA.signal.aborted).toBe(true);
      expect(acB.signal.aborted).toBe(true);
      expect(store.getState().streamingMap.has('conv1')).toBe(false);
      expect(store.getState().messages).toHaveLength(2);
    });
  });

  describe('stopAnyStreaming', () => {
    it('stops regular streaming', async () => {
      store.getState().setStreaming('conv1', makeStream({ content: '内容' }));
      await store.getState().stopAnyStreaming('conv1');
      expect(store.getState().streamingMap.has('conv1')).toBe(false);
    });

    it('stops comparison streaming', async () => {
      const streams = new Map([['m', makeStream({ content: 'x' })]]);
      store.getState().setComparisonStreaming('conv1', { type: 'comparison', streams, finishedKeys: new Set() });
      await store.getState().stopAnyStreaming('conv1');
      expect(store.getState().streamingMap.has('conv1')).toBe(false);
    });

    it('does nothing for non-existent entry', async () => {
      await store.getState().stopAnyStreaming('nope');
      // no throw
    });
  });
});
