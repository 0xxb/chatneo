import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { ChatState, MessageRow } from '../types';
import { createMessagesSlice } from '../messages';
import { createStreamingSlice } from '../streaming';

const mockDeleteMessagesByConversation = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockDeleteMessage = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockGetAttachmentPathsByMessageIds = vi.fn().mockResolvedValue([]);
const mockClearConversationSummary = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockDeleteAttachmentFile = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../lib/dao/message-dao', () => ({
  updateMessageContent: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  updateAssistantMessageContent: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  deleteMessagesByIds: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
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
  deleteAttachmentFile: (...args: unknown[]) => mockDeleteAttachmentFile(...args),
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
    id: 'm1', conversation_id: 'conv1', role: 'user', content: '你好',
    thinking: '', parts: '', token_count: null, rag_results: '', search_results: '',
    created_at: 1000, ...overrides,
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
    archivedConversations: [{ id: 'arc1', title: '归档', provider_id: 1, model_id: 'gpt-4', pinned: 0, archived: 1, summary: '归档摘要', created_at: 500, updated_at: 500 }],
    autoReadCallback: null,
    ...createStreamingSlice(set, get),
    ...createMessagesSlice(set, get),
    ...initial,
  }) as ChatState);
}

describe('messages slice — edge cases', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
  });

  it('clearMessages stops streaming before clearing', async () => {
    const ac = new AbortController();
    store.getState().setStreaming('conv1', {
      content: '流式内容', thinking: '', messageId: 'sm1',
      abortController: ac, toolCalls: [],
    });
    store.setState({ messages: [makeMsg()] });

    await store.getState().clearMessages();

    expect(ac.signal.aborted).toBe(true);
    expect(store.getState().messages).toHaveLength(0);
    expect(mockDeleteMessagesByConversation).toHaveBeenCalledWith('conv1');
  });

  it('deleteSingleMessage handles message without attachments', async () => {
    store.setState({ messages: [makeMsg({ id: 'm1', parts: '' })] });
    await store.getState().deleteSingleMessage('m1');
    expect(store.getState().messages).toHaveLength(0);
    expect(mockDeleteMessage).toHaveBeenCalledWith('m1');
  });

  it('deleteSingleMessage cleans up attachment paths', async () => {
    const msg = makeMsg({
      id: 'm1',
      attachments: [
        { id: 'a1', type: 'image', name: 'pic.png', path: '/path/pic.png' },
      ],
    });
    store.setState({ messages: [msg] });
    await store.getState().deleteSingleMessage('m1');
    // deleteAttachmentFile should be called for the attachment path
    expect(mockDeleteAttachmentFile).toHaveBeenCalledWith('/path/pic.png');
  });

  it('clearSummaryInState clears summary in archived conversations too', async () => {
    store = createTestStore({
      activeConversationId: 'arc1',
      conversations: [],
      archivedConversations: [
        { id: 'arc1', title: '归档', provider_id: 1, model_id: 'gpt-4', pinned: 0, archived: 1, summary: '有摘要', created_at: 500, updated_at: 500 },
      ],
    });
    store.setState({ messages: [makeMsg({ id: 'm1', conversation_id: 'arc1' })] });

    await store.getState().deleteSingleMessage('m1');
    expect(store.getState().archivedConversations[0].summary).toBe('');
  });

  it('deleteMessagesFrom cleans up parts media paths', async () => {
    store.setState({
      messages: [
        makeMsg({ id: 'm1', parts: '' }),
        makeMsg({ id: 'm2', parts: '[{"type":"image","path":"/gen.png"}]' }),
      ],
    });

    await store.getState().deleteMessagesFrom('m2');
    // getPartsMediaPaths mock returns ['/media/gen.png'] for non-empty parts
    expect(mockDeleteAttachmentFile).toHaveBeenCalledWith('/media/gen.png');
    expect(store.getState().messages).toHaveLength(1);
  });
});
