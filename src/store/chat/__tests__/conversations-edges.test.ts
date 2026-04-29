import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { ChatState, ConversationRow } from '../types';
import { createConversationSlice } from '../conversations';
import { createStreamingSlice } from '../streaming';
import { createMessagesSlice } from '../messages';

const mockLoadConversations = vi.fn().mockResolvedValue([]);
const mockConversationExists = vi.fn().mockResolvedValue(true);
const mockInsertConversation = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockGetMessages = vi.fn().mockResolvedValue([]);
const mockGetAttachmentsByConversation = vi.fn().mockResolvedValue([]);
const mockCopyFileToAttachments = vi.fn().mockResolvedValue('/new/path');
const mockGetConversationInstructionIds = vi.fn();
const mockGetConversationKnowledgeBases = vi.fn();

vi.mock('../../../lib/dao/conversation-dao', () => ({
  loadConversations: (...args: unknown[]) => mockLoadConversations(...args),
  searchConversations: vi.fn().mockResolvedValue([]),
  conversationExists: (...args: unknown[]) => mockConversationExists(...args),
  insertConversation: (...args: unknown[]) => mockInsertConversation(...args),
  deleteConversation: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  renameConversation: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  toggleConversationPinned: vi.fn().mockResolvedValue(true),
  toggleConversationArchived: vi.fn().mockResolvedValue(true),
  loadArchivedConversations: vi.fn().mockResolvedValue([]),
  getConversationAttachmentPaths: vi.fn().mockResolvedValue([]),
  getConversationPartStrings: vi.fn().mockResolvedValue([]),
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
  copyFileToAttachments: (...args: unknown[]) => mockCopyFileToAttachments(...args),
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
vi.mock('../../model', () => ({
  useModelStore: {
    getState: () => ({
      selectedProviderId: 1, selectedModelId: 'gpt-4',
      comparisonModel: null, selectedInstructionIds: [],
      selectedKnowledgeBaseIds: [], webSearchEnabled: false,
    }),
    setState: vi.fn(),
  },
}));
vi.mock('../../../lib/instruction', () => ({
  getConversationInstructionIds: (...args: unknown[]) => mockGetConversationInstructionIds(...args),
}));
vi.mock('../../../lib/knowledge-base', () => ({
  getConversationKnowledgeBases: (...args: unknown[]) => mockGetConversationKnowledgeBases(...args),
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
    id: 'conv1', title: '测试', provider_id: 1, model_id: 'gpt-4',
    pinned: 0, archived: 0, summary: '', created_at: 1000, updated_at: 1000,
    ...overrides,
  };
}

describe('conversations slice — edge cases', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
    mockGetConversationInstructionIds.mockResolvedValue([]);
    mockGetConversationKnowledgeBases.mockResolvedValue([]);
  });

  it('setActiveConversation handles instruction loading error gracefully', async () => {
    mockGetConversationInstructionIds.mockRejectedValueOnce(new Error('DB error'));
    store.setState({ conversations: [makeConv()] });

    await store.getState().setActiveConversation('conv1');
    // Should still activate the conversation
    expect(store.getState().activeConversationId).toBe('conv1');
  });

  it('setActiveConversation handles knowledge base loading error gracefully', async () => {
    mockGetConversationKnowledgeBases.mockRejectedValueOnce(new Error('KB error'));
    store.setState({ conversations: [makeConv()] });

    await store.getState().setActiveConversation('conv1');
    expect(store.getState().activeConversationId).toBe('conv1');
  });

  it('setActiveConversation loads message attachments', async () => {
    const msgs = [{
      id: 'm1', conversation_id: 'conv1', role: 'user', content: '图片',
      thinking: '', parts: '', token_count: null, rag_results: '', search_results: '', created_at: 1000,
    }];
    mockGetMessages.mockResolvedValueOnce(msgs);
    mockGetAttachmentsByConversation.mockResolvedValueOnce([
      { id: 'a1', message_id: 'm1', type: 'image', name: 'pic.png', path: '/p/pic.png' },
    ]);
    store.setState({ conversations: [makeConv()] });

    await store.getState().setActiveConversation('conv1');
    expect(store.getState().messages[0].attachments).toHaveLength(1);
    expect(store.getState().messages[0].attachments![0].name).toBe('pic.png');
  });

  it('createBranchConversation handles attachment copy failure gracefully', async () => {
    mockCopyFileToAttachments.mockRejectedValueOnce(new Error('copy failed'));
    mockLoadConversations.mockResolvedValue([]);
    mockConversationExists.mockResolvedValue(true);
    mockGetMessages.mockResolvedValue([]);

    const msgs = [{
      id: 'm1', conversation_id: 'conv1', role: 'user', content: 'msg1',
      thinking: '', parts: '', token_count: null, rag_results: '', search_results: '',
      created_at: 1000,
      attachments: [{ id: 'a1', type: 'image', name: 'pic.png', path: '/old/pic.png' }],
    }];
    store.setState({ messages: msgs as any, conversations: [makeConv()] });

    // Should not throw
    await store.getState().createBranchConversation('m1');
    expect(mockInsertConversation).toHaveBeenCalled();
  });

  it('setActiveConversation finds conversation in archived list', async () => {
    store.setState({
      conversations: [],
      archivedConversations: [makeConv({ id: 'arc1', archived: 1 })],
    });

    await store.getState().setActiveConversation('arc1');
    expect(store.getState().activeConversationId).toBe('arc1');
  });
});
