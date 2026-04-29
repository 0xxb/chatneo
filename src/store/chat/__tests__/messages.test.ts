import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { ChatState, MessageRow } from '../types';
import { createMessagesSlice } from '../messages';
import { createStreamingSlice } from '../streaming';

const mockUpdateMessageContent = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockUpdateAssistantMessageContent = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockDeleteMessagesByIds = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockDeleteMessagesByConversation = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockDeleteMessage = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockGetAttachmentPathsByMessageIds = vi.fn().mockResolvedValue([]);
const mockClearConversationSummary = vi.fn().mockResolvedValue({ rowsAffected: 1 });

vi.mock('../../../lib/dao/message-dao', () => ({
  updateMessageContent: (...args: unknown[]) => mockUpdateMessageContent(...args),
  updateAssistantMessageContent: (...args: unknown[]) => mockUpdateAssistantMessageContent(...args),
  deleteMessagesByIds: (...args: unknown[]) => mockDeleteMessagesByIds(...args),
  deleteMessagesByConversation: (...args: unknown[]) => mockDeleteMessagesByConversation(...args),
  deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
  getAttachmentPathsByMessageIds: (...args: unknown[]) => mockGetAttachmentPathsByMessageIds(...args),
  insertMessage: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
}));
vi.mock('../../../lib/dao/conversation-dao', () => ({
  clearConversationSummary: (...args: unknown[]) => mockClearConversationSummary(...args),
  updateConversationTimestamp: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
}));
vi.mock('../../../lib/attachments', () => ({
  deleteAttachmentFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../lib/message-parts', () => ({
  getPartsMediaPaths: (parts: string) => parts ? ['/media/gen.png'] : [],
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

function makeMsg(overrides?: Partial<MessageRow>): MessageRow {
  return {
    id: 'm1',
    conversation_id: 'conv1',
    role: 'user',
    content: '你好',
    thinking: '',
    parts: '',
    token_count: null,
    rag_results: '',
    search_results: '',
    created_at: 1000,
    ...overrides,
  };
}

function createTestStore(initial?: Partial<ChatState>) {
  return create<ChatState>((set, get) => ({
    conversations: [{ id: 'conv1', title: '测试', provider_id: 1, model_id: 'gpt-4', pinned: 0, archived: 0, summary: '旧摘要', created_at: 1000, updated_at: 1000 }],
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
    ...createMessagesSlice(set, get),
    ...initial,
  }) as ChatState);
}

describe('messages slice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
  });

  describe('startEditMessage / cancelEditMessage', () => {
    it('toggles editing state', () => {
      store.getState().startEditMessage('m1');
      expect(store.getState().editingMessageId).toBe('m1');

      store.getState().cancelEditMessage();
      expect(store.getState().editingMessageId).toBeNull();
    });
  });

  describe('updateMessageContent', () => {
    it('updates user message content', async () => {
      store.setState({ messages: [makeMsg()] });
      await store.getState().updateMessageContent('m1', '新内容');

      expect(store.getState().messages[0].content).toBe('新内容');
      expect(mockUpdateMessageContent).toHaveBeenCalledWith('m1', '新内容');
    });

    it('updates assistant message and clears metadata', async () => {
      store.setState({ messages: [makeMsg({ role: 'assistant', thinking: '思考', parts: '[]' })] });
      await store.getState().updateMessageContent('m1', '新回复');

      const msg = store.getState().messages[0];
      expect(msg.content).toBe('新回复');
      expect(msg.thinking).toBe('');
      expect(msg.parts).toBe('');
      expect(mockUpdateAssistantMessageContent).toHaveBeenCalledWith('m1', '新回复');
    });

    it('clears conversation summary', async () => {
      store.setState({ messages: [makeMsg()] });
      await store.getState().updateMessageContent('m1', '修改');
      expect(mockClearConversationSummary).toHaveBeenCalledWith('conv1');
    });

    it('rolls back on DB error', async () => {
      mockUpdateMessageContent.mockRejectedValueOnce(new Error('DB error'));
      store.setState({ messages: [makeMsg({ content: '原始' })] });

      await expect(store.getState().updateMessageContent('m1', '失败')).rejects.toThrow('DB error');
      expect(store.getState().messages[0].content).toBe('原始');
    });

    it('does nothing for non-existent message', async () => {
      store.setState({ messages: [] });
      await store.getState().updateMessageContent('nonexistent', 'x');
      expect(mockUpdateMessageContent).not.toHaveBeenCalled();
    });
  });

  describe('deleteMessagesFrom', () => {
    it('deletes from specified message onwards', async () => {
      store.setState({
        messages: [
          makeMsg({ id: 'm1', created_at: 1000 }),
          makeMsg({ id: 'm2', created_at: 2000 }),
          makeMsg({ id: 'm3', created_at: 3000 }),
        ],
      });
      const remaining = await store.getState().deleteMessagesFrom('m2');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('m1');
      expect(store.getState().messages).toHaveLength(1);
    });

    it('deletes all when targeting first message', async () => {
      store.setState({ messages: [makeMsg({ id: 'm1' }), makeMsg({ id: 'm2' })] });
      const remaining = await store.getState().deleteMessagesFrom('m1');
      expect(remaining).toHaveLength(0);
    });

    it('clears summary after deletion', async () => {
      store.setState({ messages: [makeMsg()] });
      await store.getState().deleteMessagesFrom('m1');
      expect(mockClearConversationSummary).toHaveBeenCalledWith('conv1');
    });

    it('returns full list for non-existent messageId', async () => {
      store.setState({ messages: [makeMsg()] });
      const remaining = await store.getState().deleteMessagesFrom('nonexistent');
      expect(remaining).toHaveLength(1);
    });
  });

  describe('deleteSingleMessage', () => {
    it('removes single message from state', async () => {
      store.setState({ messages: [makeMsg({ id: 'm1' }), makeMsg({ id: 'm2' })] });
      await store.getState().deleteSingleMessage('m1');

      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0].id).toBe('m2');
      expect(mockDeleteMessage).toHaveBeenCalledWith('m1');
    });

    it('does nothing for non-existent message', async () => {
      store.setState({ messages: [makeMsg()] });
      await store.getState().deleteSingleMessage('nope');
      expect(mockDeleteMessage).not.toHaveBeenCalled();
    });
  });

  describe('clearMessages', () => {
    it('clears all messages and calls DB', async () => {
      store.setState({ messages: [makeMsg({ id: 'm1' }), makeMsg({ id: 'm2' })] });
      await store.getState().clearMessages();

      expect(store.getState().messages).toHaveLength(0);
      expect(mockDeleteMessagesByConversation).toHaveBeenCalledWith('conv1');
      expect(mockClearConversationSummary).toHaveBeenCalledWith('conv1');
    });

    it('does nothing without active conversation', async () => {
      store.setState({ activeConversationId: null });
      await store.getState().clearMessages();
      expect(mockDeleteMessagesByConversation).not.toHaveBeenCalled();
    });
  });

  describe('setAutoReadCallback', () => {
    it('sets and clears callback', () => {
      const cb = vi.fn();
      store.getState().setAutoReadCallback('conv1', cb);
      expect(store.getState().autoReadCallback).toEqual({ convId: 'conv1', cb });

      store.getState().setAutoReadCallback('conv1', null);
      expect(store.getState().autoReadCallback).toBeNull();
    });
  });
});
