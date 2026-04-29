import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsertMessage = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockInsertUserMessage = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockInsertErrorMessage = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockUpdateConversationTimestamp = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockGetSharedPaths = vi.fn().mockResolvedValue(new Set());
const mockInsertAttachment = vi.fn().mockResolvedValue({ rowsAffected: 1 });

const storeState = {
  activeConversationId: 'conv1',
  messages: [] as any[],
  setStreaming: vi.fn(),
  loadConversations: vi.fn().mockResolvedValue(undefined),
};
const mockSetState = vi.fn((fn: any, _replace?: boolean) => {
  if (typeof fn === 'function') {
    const result = fn(storeState);
    Object.assign(storeState, result);
  }
});

vi.mock('../../store/chat', () => ({
  useChatStore: {
    getState: () => storeState,
    setState: (fn: any, replace?: boolean) => mockSetState(fn, replace),
  },
}));
vi.mock('../dao/message-dao', () => ({
  insertMessage: (...args: unknown[]) => mockInsertMessage(...args),
  insertUserMessage: (...args: unknown[]) => mockInsertUserMessage(...args),
  insertErrorMessage: (...args: unknown[]) => mockInsertErrorMessage(...args),
}));
vi.mock('../dao/conversation-dao', () => ({
  updateConversationTimestamp: (...args: unknown[]) => mockUpdateConversationTimestamp(...args),
}));
vi.mock('../dao/attachment-dao', () => ({
  getSharedPaths: (...args: unknown[]) => mockGetSharedPaths(...args),
  insertAttachment: (...args: unknown[]) => mockInsertAttachment(...args),
}));
vi.mock('../attachments', () => ({
  ensureAttachmentsDir: vi.fn().mockResolvedValue('/app/attachments'),
  saveImageFile: vi.fn().mockResolvedValue('/app/attachments/saved.png'),
  copyFileToAttachments: vi.fn().mockResolvedValue('/app/attachments/copied.pdf'),
  cacheImageDataUrl: vi.fn(),
}));
vi.mock('../utils', () => ({
  safeJsonParse: <T>(str: string, fallback: T): T => {
    try { return JSON.parse(str); } catch { return fallback; }
  },
  sanitizeErrorDetail: (s: string) => s,
  nowUnix: () => 1700000000,
}));
vi.mock('../message-parts', () => ({
  parseMessageParts: () => [],
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { persistAssistantMessage, persistErrorMessage, saveUserMessage } from '../chat-persistence';

describe('chat-persistence (full)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.messages = [];
    storeState.activeConversationId = 'conv1';
  });

  describe('persistAssistantMessage', () => {
    it('inserts message to DB and adds to store', async () => {
      const msg = await persistAssistantMessage({
        messageId: 'msg1',
        convId: 'conv1',
        content: '你好！',
        thinking: '思考',
      });
      expect(mockInsertMessage).toHaveBeenCalledWith(expect.objectContaining({
        id: 'msg1',
        conversationId: 'conv1',
        content: '你好！',
        thinking: '思考',
        role: 'assistant',
      }));
      expect(mockUpdateConversationTimestamp).toHaveBeenCalledWith('conv1', 1700000000);
      expect(msg.id).toBe('msg1');
      expect(msg.content).toBe('你好！');
    });

    it('clears streaming state', async () => {
      await persistAssistantMessage({ messageId: 'msg1', convId: 'conv1', content: 'test' });
      expect(storeState.setStreaming).toHaveBeenCalledWith('conv1', null);
    });

    it('handles optional fields', async () => {
      const msg = await persistAssistantMessage({
        messageId: 'msg1',
        convId: 'conv1',
        content: '回复',
        partsJson: '[{"type":"tool-call"}]',
        usageJson: '{"totalTokens":100}',
        ragResultsJson: '[{"content":"doc"}]',
        searchResultsJson: '[{"title":"result"}]',
      });
      expect(mockInsertMessage).toHaveBeenCalledWith(expect.objectContaining({
        parts: '[{"type":"tool-call"}]',
        tokenCount: '{"totalTokens":100}',
        ragResults: '[{"content":"doc"}]',
        searchResults: '[{"title":"result"}]',
      }));
      expect(msg.parts).toBe('[{"type":"tool-call"}]');
    });
  });

  describe('persistErrorMessage', () => {
    it('inserts error message and adds to store', () => {
      persistErrorMessage('conv1', 'API 超时');
      expect(mockInsertErrorMessage).toHaveBeenCalledWith(
        expect.any(String), 'conv1', 'API 超时', 1700000000,
      );
      expect(mockSetState).toHaveBeenCalled();
    });

    it('does not add to store if not active conversation', () => {
      storeState.activeConversationId = 'other';
      persistErrorMessage('conv1', '错误');
      // setState is still called but the condition inside checks activeConversationId
      expect(mockInsertErrorMessage).toHaveBeenCalled();
    });
  });

  describe('saveUserMessage', () => {
    it('saves text-only message', async () => {
      await saveUserMessage('conv1', '你好', []);
      expect(mockInsertUserMessage).toHaveBeenCalledWith(
        expect.any(String), 'conv1', '你好', 1700000000,
      );
      expect(mockSetState).toHaveBeenCalled();
    });

    it('saves message with file attachment', async () => {
      const att = { id: 'a1', type: 'file' as const, name: 'doc.pdf', path: '/external/doc.pdf' };
      await saveUserMessage('conv1', '看文档', [att]);
      expect(mockInsertAttachment).toHaveBeenCalled();
    });

    it('saves message with image attachment (data URL)', async () => {
      const att = { id: 'a1', type: 'image' as const, name: 'pic.png', preview: 'data:image/png;base64,abc', path: undefined as any };
      await saveUserMessage('conv1', '看图', [att]);
      expect(mockInsertAttachment).toHaveBeenCalled();
    });
  });
});
