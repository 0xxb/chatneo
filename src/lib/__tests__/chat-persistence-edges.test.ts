import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockInsertUserMessage,
  mockGetSharedPaths,
  mockInsertAttachment,
  mockSaveImageFile,
  mockCopyFileToAttachments,
  mockLogger,
} = vi.hoisted(() => ({
  mockInsertUserMessage: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  mockGetSharedPaths: vi.fn().mockResolvedValue(new Set()),
  mockInsertAttachment: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  mockSaveImageFile: vi.fn().mockResolvedValue('/app/attachments/saved.png'),
  mockCopyFileToAttachments: vi.fn(),
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const storeState = vi.hoisted(() => ({
  activeConversationId: 'conv1',
  messages: [] as any[],
  setStreaming: vi.fn(),
  loadConversations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../store/chat', () => ({
  useChatStore: {
    getState: () => storeState,
    setState: vi.fn((fn) => {
      if (typeof fn === 'function') Object.assign(storeState, fn(storeState));
    }),
  },
}));
vi.mock('../dao/message-dao', () => ({
  insertMessage: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  insertUserMessage: (...args: unknown[]) => mockInsertUserMessage(...args),
  insertErrorMessage: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
}));
vi.mock('../dao/conversation-dao', () => ({
  updateConversationTimestamp: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
}));
vi.mock('../dao/attachment-dao', () => ({
  getSharedPaths: (...args: unknown[]) => mockGetSharedPaths(...args),
  insertAttachment: (...args: unknown[]) => mockInsertAttachment(...args),
}));
vi.mock('../attachments', () => ({
  ensureAttachmentsDir: vi.fn().mockResolvedValue('/app/attachments'),
  saveImageFile: (...args: unknown[]) => mockSaveImageFile(...args),
  copyFileToAttachments: (...args: unknown[]) => mockCopyFileToAttachments(...args),
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
  logger: mockLogger,
}));

import { saveUserMessage } from '../chat-persistence';

describe('saveUserMessage — attachment error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.messages = [];
    mockCopyFileToAttachments.mockResolvedValue('/app/attachments/copied.pdf');
  });

  it('filters out attachments that fail to save (Promise rejected)', async () => {
    mockCopyFileToAttachments
      .mockRejectedValueOnce(new Error('copy failed'))
      .mockResolvedValueOnce('/app/attachments/ok.pdf');

    const attachments = [
      { id: 'a1', type: 'file' as const, name: 'bad.pdf', path: '/external/bad.pdf' },
      { id: 'a2', type: 'file' as const, name: 'good.pdf', path: '/external/good.pdf' },
    ];

    await saveUserMessage('conv1', '文件', attachments);

    // Only the successful attachment should be inserted
    expect(mockInsertAttachment).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'attachment',
      expect.stringContaining('附件保存失败: bad.pdf'),
    );
  });

  it('filters out attachments with empty path after save', async () => {
    // Attachment without path and not a data URL image — path stays undefined
    const attachments = [
      { id: 'a1', type: 'file' as const, name: 'empty.txt', path: undefined as any },
    ];

    await saveUserMessage('conv1', '空路径', attachments);

    expect(mockInsertAttachment).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'attachment',
      expect.stringContaining('附件路径为空: empty.txt'),
    );
  });

  it('copies file when path is within attachments dir and shared', async () => {
    mockGetSharedPaths.mockResolvedValueOnce(new Set(['/app/attachments/shared.pdf']));
    mockCopyFileToAttachments.mockResolvedValueOnce('/app/attachments/shared-copy.pdf');

    const attachments = [
      { id: 'a1', type: 'file' as const, name: 'shared.pdf', path: '/app/attachments/shared.pdf' },
    ];

    await saveUserMessage('conv1', '共享文件', attachments);

    expect(mockCopyFileToAttachments).toHaveBeenCalledWith('/app/attachments/shared.pdf');
    expect(mockInsertAttachment).toHaveBeenCalledTimes(1);
  });

  it('saves message even when all attachments fail', async () => {
    mockCopyFileToAttachments.mockRejectedValue(new Error('all fail'));

    const attachments = [
      { id: 'a1', type: 'file' as const, name: 'bad1.pdf', path: '/external/bad1.pdf' },
      { id: 'a2', type: 'file' as const, name: 'bad2.pdf', path: '/external/bad2.pdf' },
    ];

    await saveUserMessage('conv1', '全失败', attachments);

    // Message should still be saved
    expect(mockInsertUserMessage).toHaveBeenCalled();
    // No attachments inserted
    expect(mockInsertAttachment).not.toHaveBeenCalled();
  });
});
