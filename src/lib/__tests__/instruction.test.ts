import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetConversationInstructions = vi.fn();

vi.mock('../dao/instruction-dao', () => ({
  listInstructions: vi.fn(() => Promise.resolve([])),
  insertInstruction: vi.fn(() => Promise.resolve()),
  updateInstruction: vi.fn(() => Promise.resolve()),
  deleteInstruction: vi.fn(() => Promise.resolve()),
  getConversationInstructions: (...args: unknown[]) => mockGetConversationInstructions(...args),
  setConversationInstructions: vi.fn(() => Promise.resolve()),
  getConversationInstructionIds: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../apply-settings', () => ({
  getSettingValue: vi.fn(),
}));

vi.mock('../../store/model', () => ({
  useModelStore: { getState: vi.fn(() => ({})) },
}));

vi.mock('../tool-registry', () => ({
  buildToolsParam: vi.fn(),
  getAllTools: vi.fn(() => []),
}));

vi.mock('../dao/tool-dao', () => ({
  listTools: vi.fn(() => Promise.resolve([])),
  getToolConfig: vi.fn(),
}));

import { injectInstructions } from '../chat-params';

describe('injectInstructions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepends system message when instructions exist', async () => {
    mockGetConversationInstructions.mockResolvedValue([
      { id: '1', title: 'Rule 1', content: '你是一个专业助手', enabled: 1, sort_order: 0, created_at: 0 },
      { id: '2', title: 'Rule 2', content: '使用中文回答', enabled: 1, sort_order: 1, created_at: 0 },
    ]);

    const messages: any[] = [{ role: 'user', content: '你好' }];
    await injectInstructions('conv-1', messages);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('你是一个专业助手');
    expect(messages[0].content).toContain('使用中文回答');
    // Two instructions joined by \n\n
    expect(messages[0].content).toBe('你是一个专业助手\n\n使用中文回答');
  });

  it('does not modify messages when no instructions', async () => {
    mockGetConversationInstructions.mockResolvedValue([]);

    const messages: any[] = [{ role: 'user', content: '你好' }];
    await injectInstructions('conv-1', messages);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });

  it('handles errors gracefully without throwing', async () => {
    mockGetConversationInstructions.mockRejectedValue(new Error('DB error'));

    const messages: any[] = [{ role: 'user', content: '你好' }];
    // Should not throw
    await expect(injectInstructions('conv-1', messages)).resolves.toBeUndefined();
    expect(messages).toHaveLength(1);
  });
});
