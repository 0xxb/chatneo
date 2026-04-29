import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { ChatState, ConversationRow } from '../types';
import { createConversationSlice } from '../conversations';
import { createStreamingSlice } from '../streaming';
import { createMessagesSlice } from '../messages';

const mockLoadConversations = vi.fn().mockResolvedValue([]);
const mockSearchConversations = vi.fn().mockResolvedValue([]);
const mockConversationExists = vi.fn().mockResolvedValue(true);
const mockInsertConversation = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockDeleteConversation = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockRenameConversation = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockToggleConversationPinned = vi.fn().mockResolvedValue(true);
const mockToggleConversationArchived = vi.fn().mockResolvedValue(true);
const mockLoadArchivedConversations = vi.fn().mockResolvedValue([]);
const mockGetConversationAttachmentPaths = vi.fn().mockResolvedValue([]);
const mockGetConversationPartStrings = vi.fn().mockResolvedValue([]);
const mockGetMessages = vi.fn().mockResolvedValue([]);
const mockGetAttachmentsByConversation = vi.fn().mockResolvedValue([]);

vi.mock('../../../lib/dao/conversation-dao', () => ({
  loadConversations: (...args: unknown[]) => mockLoadConversations(...args),
  searchConversations: (...args: unknown[]) => mockSearchConversations(...args),
  conversationExists: (...args: unknown[]) => mockConversationExists(...args),
  insertConversation: (...args: unknown[]) => mockInsertConversation(...args),
  deleteConversation: (...args: unknown[]) => mockDeleteConversation(...args),
  renameConversation: (...args: unknown[]) => mockRenameConversation(...args),
  toggleConversationPinned: (...args: unknown[]) => mockToggleConversationPinned(...args),
  toggleConversationArchived: (...args: unknown[]) => mockToggleConversationArchived(...args),
  loadArchivedConversations: (...args: unknown[]) => mockLoadArchivedConversations(...args),
  getConversationAttachmentPaths: (...args: unknown[]) => mockGetConversationAttachmentPaths(...args),
  getConversationPartStrings: (...args: unknown[]) => mockGetConversationPartStrings(...args),
  clearConversationSummary: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  updateConversationTimestamp: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
}));
vi.mock('../../../lib/dao/message-dao', () => ({
  getMessages: (...args: unknown[]) => mockGetMessages(...args),
  insertBranchMessage: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  insertMessage: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  deleteMessagesByIds: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  deleteMessagesByConversation: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  deleteMessage: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  getAttachmentPathsByMessageIds: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../lib/dao/attachment-dao', () => ({
  getAttachmentsByConversation: (...args: unknown[]) => mockGetAttachmentsByConversation(...args),
  insertAttachment: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
}));
vi.mock('../../../lib/attachments', () => ({
  deleteAttachmentFile: vi.fn().mockResolvedValue(undefined),
  getAttachmentUrl: (p: string) => `asset://${p}`,
  copyFileToAttachments: vi.fn().mockResolvedValue('/new/path'),
}));
vi.mock('../../../lib/message-parts', () => ({
  parseMessageParts: () => [],
  getPartsMediaPaths: () => [],
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
vi.mock('../../../locales', () => ({
  default: { t: (k: string) => k },
}));

// Mock useModelStore
const mockModelState = {
  selectedProviderId: 1,
  selectedModelId: 'gpt-4',
  comparisonModel: null,
  selectedInstructionIds: [] as string[],
  selectedKnowledgeBaseIds: [] as string[],
  webSearchEnabled: false,
};
vi.mock('../../model', () => ({
  useModelStore: {
    getState: () => mockModelState,
    setState: vi.fn(),
  },
}));
vi.mock('../../../lib/instruction', () => ({
  getConversationInstructionIds: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../lib/knowledge-base', () => ({
  getConversationKnowledgeBases: vi.fn().mockResolvedValue([]),
}));

function createTestStore() {
  return create<ChatState>((set, get) => ({
    conversations: [],
    activeConversationId: null,
    messages: [],
    editingMessageId: null,
    hasMoreConversations: true,
    isLoadingMore: false,
    searchResults: null,
    isSearching: false,
    archivedConversations: [],
    autoReadCallback: null,
    ...createConversationSlice(set, get),
    ...createStreamingSlice(set, get),
    ...createMessagesSlice(set, get),
  }) as ChatState);
}

function makeConv(overrides?: Partial<ConversationRow>): ConversationRow {
  return {
    id: 'conv1',
    title: '测试对话',
    provider_id: 1,
    model_id: 'gpt-4',
    pinned: 0,
    archived: 0,
    summary: '',
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

describe('conversations slice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
  });

  describe('loadConversations', () => {
    it('loads and sets conversations', async () => {
      const rows = [makeConv(), makeConv({ id: 'conv2' })];
      mockLoadConversations.mockResolvedValueOnce(rows);
      await store.getState().loadConversations();
      expect(store.getState().conversations).toEqual(rows);
    });

    it('sets hasMore=false when less than page size', async () => {
      mockLoadConversations.mockResolvedValueOnce([makeConv()]);
      await store.getState().loadConversations();
      expect(store.getState().hasMoreConversations).toBe(false);
    });

    it('sets hasMore=true when full page', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => makeConv({ id: `c${i}` }));
      mockLoadConversations.mockResolvedValueOnce(rows);
      await store.getState().loadConversations();
      expect(store.getState().hasMoreConversations).toBe(true);
    });
  });

  describe('loadMoreConversations', () => {
    it('appends next page', async () => {
      store.setState({ conversations: [makeConv()], hasMoreConversations: true });
      mockLoadConversations.mockResolvedValueOnce([makeConv({ id: 'conv2' })]);
      await store.getState().loadMoreConversations();
      expect(store.getState().conversations).toHaveLength(2);
    });

    it('does nothing when no more', async () => {
      store.setState({ hasMoreConversations: false });
      await store.getState().loadMoreConversations();
      expect(mockLoadConversations).not.toHaveBeenCalled();
    });
  });

  describe('searchConversations', () => {
    it('searches and sets results', async () => {
      const results = [makeConv()];
      mockSearchConversations.mockResolvedValueOnce(results);
      await store.getState().searchConversations('测试');
      expect(store.getState().searchResults).toEqual(results);
      expect(store.getState().isSearching).toBe(false);
    });

    it('clears results for empty keyword', async () => {
      store.setState({ searchResults: [makeConv()] });
      await store.getState().searchConversations('');
      expect(store.getState().searchResults).toBeNull();
    });
  });

  describe('setActiveConversation', () => {
    it('clears state when id is null', async () => {
      store.setState({ activeConversationId: 'conv1', messages: [{ id: 'm1' } as any] });
      await store.getState().setActiveConversation(null as any);
      expect(store.getState().activeConversationId).toBeNull();
      expect(store.getState().messages).toHaveLength(0);
    });

    it('validates conversation exists', async () => {
      mockConversationExists.mockResolvedValueOnce(false);
      await store.getState().setActiveConversation('ghost');
      expect(store.getState().activeConversationId).toBeNull();
    });

    it('loads messages when conversation exists', async () => {
      const msgs = [{ id: 'm1', conversation_id: 'conv1', role: 'user', content: '你好', thinking: '', parts: '', token_count: null, rag_results: '', search_results: '', created_at: 1000 }];
      mockGetMessages.mockResolvedValueOnce(msgs);
      store.setState({ conversations: [makeConv()] });
      await store.getState().setActiveConversation('conv1');
      expect(store.getState().activeConversationId).toBe('conv1');
      expect(store.getState().messages).toHaveLength(1);
    });
  });

  describe('createConversation', () => {
    it('creates and reloads conversations', async () => {
      mockLoadConversations.mockResolvedValueOnce([]);
      const id = await store.getState().createConversation();
      expect(id).toBeTruthy();
      expect(mockInsertConversation).toHaveBeenCalledWith(id, 'chat.newConversation', 1, 'gpt-4', 99999);
    });
  });

  describe('deleteConversation', () => {
    it('deletes and reloads', async () => {
      mockLoadConversations.mockResolvedValue([]);
      mockLoadArchivedConversations.mockResolvedValue([]);
      store.setState({ activeConversationId: 'conv1', messages: [{ id: 'm1' } as any] });
      await store.getState().deleteConversation('conv1');
      expect(mockDeleteConversation).toHaveBeenCalledWith('conv1');
      expect(store.getState().activeConversationId).toBeNull();
      expect(store.getState().messages).toHaveLength(0);
    });

    it('does not clear active state when deleting other conversation', async () => {
      mockLoadConversations.mockResolvedValue([]);
      mockLoadArchivedConversations.mockResolvedValue([]);
      store.setState({ activeConversationId: 'conv1' });
      await store.getState().deleteConversation('conv2');
      expect(store.getState().activeConversationId).toBe('conv1');
    });
  });

  describe('renameConversation', () => {
    it('renames in DAO and updates state', async () => {
      store.setState({ conversations: [makeConv()] });
      await store.getState().renameConversation('conv1', '新标题');
      expect(mockRenameConversation).toHaveBeenCalledWith('conv1', '新标题');
      expect(store.getState().conversations[0].title).toBe('新标题');
    });
  });

  describe('newChat', () => {
    it('clears active conversation and messages', () => {
      store.setState({ activeConversationId: 'conv1', messages: [{ id: 'm1' } as any] });
      store.getState().newChat();
      expect(store.getState().activeConversationId).toBeNull();
      expect(store.getState().messages).toHaveLength(0);
    });
  });

  describe('pinConversation', () => {
    it('calls toggle and reloads', async () => {
      mockLoadConversations.mockResolvedValueOnce([]);
      await store.getState().pinConversation('conv1');
      expect(mockToggleConversationPinned).toHaveBeenCalledWith('conv1');
    });
  });

  describe('archiveConversation', () => {
    it('archives and clears active if same', async () => {
      mockLoadConversations.mockResolvedValue([]);
      mockLoadArchivedConversations.mockResolvedValue([]);
      store.setState({ activeConversationId: 'conv1' });
      await store.getState().archiveConversation('conv1');
      expect(store.getState().activeConversationId).toBeNull();
    });
  });

  describe('loadArchivedConversations', () => {
    it('loads archived list', async () => {
      const archived = [makeConv({ archived: 1 })];
      mockLoadArchivedConversations.mockResolvedValueOnce(archived);
      await store.getState().loadArchivedConversations();
      expect(store.getState().archivedConversations).toEqual(archived);
    });
  });

  describe('createBranchConversation', () => {
    it('does nothing if message not found', async () => {
      store.setState({ messages: [] });
      await store.getState().createBranchConversation('nonexistent');
      expect(mockInsertConversation).not.toHaveBeenCalled();
    });

    it('creates branch with messages up to target', async () => {
      const msgs = [
        { id: 'm1', conversation_id: 'conv1', role: 'user', content: 'msg1', thinking: '', parts: '', token_count: null, rag_results: '', search_results: '', created_at: 1000 },
        { id: 'm2', conversation_id: 'conv1', role: 'assistant', content: 'reply', thinking: '', parts: '', token_count: null, rag_results: '', search_results: '', created_at: 2000 },
        { id: 'm3', conversation_id: 'conv1', role: 'user', content: 'msg3', thinking: '', parts: '', token_count: null, rag_results: '', search_results: '', created_at: 3000 },
      ];
      store.setState({ messages: msgs as any, conversations: [makeConv()] });
      mockLoadConversations.mockResolvedValue([]);
      mockConversationExists.mockResolvedValue(true);
      mockGetMessages.mockResolvedValue([]);

      await store.getState().createBranchConversation('m2');
      expect(mockInsertConversation).toHaveBeenCalled(); // createConversation was called
    });
  });
});
