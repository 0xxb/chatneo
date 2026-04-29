import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateText = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

const mockResolveModelForPlugin = vi.fn();
vi.mock('../providers', () => ({
  resolveModelForPlugin: (...args: unknown[]) => mockResolveModelForPlugin(...args),
}));

const mockRenameConversation = vi.fn().mockResolvedValue(undefined);
vi.mock('../dao/conversation-dao', () => ({
  renameConversation: (...args: unknown[]) => mockRenameConversation(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
}));

import { generateTitle, generateTitleHook } from '../../plugins/generate-title/generate-title';
import type { OnResponseReceivedContext } from '../plugin-registry';

const defaultConversation = { provider_id: -2, model_id: 'gpt-4' };
const defaultMessages = [
  { role: 'user', content: '你好' },
  { role: 'assistant', content: '你好！有什么可以帮助你的吗？' },
];

function makeCtx(overrides: Partial<OnResponseReceivedContext> = {}): OnResponseReceivedContext {
  return {
    conversationId: 'conv1',
    conversation: { id: 'conv1', title: '新对话', provider_id: -2, model_id: 'gpt-4', summary: '' },
    messages: defaultMessages,
    assistantMessage: '你好！',
    userMessage: '你好',
    ...overrides,
  };
}

describe('generate-title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateTitle', () => {
    it('uses AI to generate title and saves it', async () => {
      const mockModel = {};
      mockResolveModelForPlugin.mockResolvedValueOnce(mockModel);
      mockGenerateText.mockResolvedValueOnce({ text: '  日常问候  ' });

      await generateTitle('conv1', defaultConversation, defaultMessages, {
        trigger: 'first_message', provider_id: null, model_id: 'gpt-4',
      });

      expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
        model: mockModel,
      }));
      expect(mockRenameConversation).toHaveBeenCalledWith('conv1', '日常问候');
    });

    it('strips quotes from generated title', async () => {
      mockResolveModelForPlugin.mockResolvedValueOnce({});
      mockGenerateText.mockResolvedValueOnce({ text: '"关于编程的对话"' });

      await generateTitle('conv1', defaultConversation, defaultMessages, {
        trigger: 'first_message', provider_id: null, model_id: 'gpt-4',
      });

      expect(mockRenameConversation).toHaveBeenCalledWith('conv1', '关于编程的对话');
    });

    it('truncates title to 30 characters', async () => {
      mockResolveModelForPlugin.mockResolvedValueOnce({});
      mockGenerateText.mockResolvedValueOnce({ text: '这是一个非常非常非常非常非常非常非常非常长的标题文字超过三十个字' });

      await generateTitle('conv1', defaultConversation, defaultMessages, {
        trigger: 'first_message', provider_id: null, model_id: 'gpt-4',
      });

      const savedTitle = mockRenameConversation.mock.calls[0][1];
      expect(savedTitle.length).toBeLessThanOrEqual(30);
    });

    it('falls back to first user message when no model available', async () => {
      mockResolveModelForPlugin.mockResolvedValueOnce(null);

      await generateTitle('conv1', defaultConversation, defaultMessages, {
        trigger: 'first_message', provider_id: null, model_id: '',
      });

      expect(mockGenerateText).not.toHaveBeenCalled();
      expect(mockRenameConversation).toHaveBeenCalledWith('conv1', '你好');
    });

    it('falls back to 新对话 when no user messages and no model', async () => {
      mockResolveModelForPlugin.mockResolvedValueOnce(null);

      await generateTitle('conv1', defaultConversation, [], {
        trigger: 'first_message', provider_id: null, model_id: '',
      });

      expect(mockRenameConversation).toHaveBeenCalledWith('conv1', '新对话');
    });

    it('falls back to 新对话 when AI returns empty', async () => {
      mockResolveModelForPlugin.mockResolvedValueOnce({});
      mockGenerateText.mockResolvedValueOnce({ text: '   ' });

      await generateTitle('conv1', defaultConversation, defaultMessages, {
        trigger: 'first_message', provider_id: null, model_id: 'gpt-4',
      });

      expect(mockRenameConversation).toHaveBeenCalledWith('conv1', '新对话');
    });

    it('limits context to first 6 messages', async () => {
      mockResolveModelForPlugin.mockResolvedValueOnce({});
      mockGenerateText.mockResolvedValueOnce({ text: '标题' });

      const manyMessages = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `消息 ${i}`,
      }));

      await generateTitle('conv1', defaultConversation, manyMessages, {
        trigger: 'first_message', provider_id: null, model_id: 'gpt-4',
      });

      const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
      expect(prompt).toContain('消息 0');
      expect(prompt).toContain('消息 5');
      expect(prompt).not.toContain('消息 6');
    });
  });

  describe('generateTitleHook', () => {
    it('skips when trigger is disabled', async () => {
      await generateTitleHook(makeCtx(), { trigger: 'disabled', provider_id: null, model_id: '' });
      expect(mockResolveModelForPlugin).not.toHaveBeenCalled();
    });

    it('triggers on first message only when trigger is first_message', async () => {
      mockResolveModelForPlugin.mockResolvedValueOnce(null);

      // Only 1 user message → should trigger
      const ctx = makeCtx({
        messages: [{ role: 'user', content: '你好' }, { role: 'assistant', content: '嗨' }],
      });
      await generateTitleHook(ctx, { trigger: 'first_message', provider_id: null, model_id: '' });
      expect(mockRenameConversation).toHaveBeenCalled();
    });

    it('does not trigger when more than one user message and trigger is first_message', async () => {
      const ctx = makeCtx({
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '嗨' },
          { role: 'user', content: '再见' },
          { role: 'assistant', content: '拜拜' },
        ],
      });
      await generateTitleHook(ctx, { trigger: 'first_message', provider_id: null, model_id: '' });
      expect(mockResolveModelForPlugin).not.toHaveBeenCalled();
    });

    it('always triggers when trigger is every_message', async () => {
      mockResolveModelForPlugin.mockResolvedValueOnce(null);

      const ctx = makeCtx({
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '嗨' },
          { role: 'user', content: '再见' },
          { role: 'assistant', content: '拜拜' },
        ],
      });
      await generateTitleHook(ctx, { trigger: 'every_message', provider_id: null, model_id: '' });
      expect(mockRenameConversation).toHaveBeenCalled();
    });

    it('defaults trigger to first_message when not specified', async () => {
      mockResolveModelForPlugin.mockResolvedValueOnce(null);

      const ctx = makeCtx({
        messages: [{ role: 'user', content: '你好' }, { role: 'assistant', content: '嗨' }],
      });
      await generateTitleHook(ctx, { provider_id: null, model_id: '' });
      expect(mockRenameConversation).toHaveBeenCalled();
    });
  });
});
