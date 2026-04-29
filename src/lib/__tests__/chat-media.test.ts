import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Store mock ---
const mockStreamingMap = new Map();
const mockSetStreaming = vi.fn();
const mockGetState = vi.fn(() => ({
  streamingMap: mockStreamingMap,
  setStreaming: mockSetStreaming,
}));

vi.mock('../../store/chat', () => ({
  useChatStore: { getState: () => mockGetState() },
}));

// --- Chat functions ---
const mockGenerateImageChat = vi.fn().mockResolvedValue(undefined);
const mockGenerateVideoChat = vi.fn().mockResolvedValue(undefined);
vi.mock('../chat', () => ({
  generateImageChat: (...args: unknown[]) => mockGenerateImageChat(...args),
  generateVideoChat: (...args: unknown[]) => mockGenerateVideoChat(...args),
}));

// --- Attachments ---
const mockResolveImageDataUrl = vi.fn().mockResolvedValue('data:image/png;base64,abc');
vi.mock('../attachments', () => ({
  resolveImageDataUrl: (...args: unknown[]) => mockResolveImageDataUrl(...args),
}));

// --- Image settings ---
const mockGetImageSettings = vi.fn().mockResolvedValue({});
vi.mock('../providers/get-image-settings', () => ({
  getImageSettings: (...args: unknown[]) => mockGetImageSettings(...args),
}));

// --- Persistence ---
const mockPersistAssistantMessage = vi.fn().mockResolvedValue(undefined);
const mockPersistErrorMessage = vi.fn().mockResolvedValue(undefined);
const mockFormatErrorDetail = vi.fn().mockReturnValue('error detail');
vi.mock('../chat-persistence', () => ({
  persistAssistantMessage: (...args: unknown[]) => mockPersistAssistantMessage(...args),
  persistErrorMessage: (...args: unknown[]) => mockPersistErrorMessage(...args),
  formatErrorDetail: (...args: unknown[]) => mockFormatErrorDetail(...args),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../locales', () => ({
  default: { t: (key: string, opts?: Record<string, unknown>) => `${key}:${JSON.stringify(opts)}` },
}));

import { runImageStrategy, runVideoStrategy } from '../chat-media';

const baseOpts = {
  convId: 'conv1',
  providerId: 1,
  modelId: 'dall-e-3',
  streamingMsgId: 'msg1',
  abortController: new AbortController(),
  lastUserRow: { id: 'u1', role: 'user' as const, content: '画一只猫', attachments: [] } as any,
  seed: null as number | null | undefined,
};

describe('chat-media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamingMap.clear();
    mockStreamingMap.set('conv1', { content: '', thinking: '', messageId: 'msg1', toolCalls: [] });
  });

  describe('runImageStrategy', () => {
    it('sets mediaType to image on streaming state', async () => {
      await runImageStrategy(baseOpts);

      expect(mockSetStreaming).toHaveBeenCalledWith('conv1', expect.objectContaining({
        mediaType: 'image',
      }));
    });

    it('fetches image settings and calls generateImageChat', async () => {
      mockGetImageSettings.mockResolvedValueOnce({ size: '1024x1024', n: 2 });
      await runImageStrategy(baseOpts);

      expect(mockGetImageSettings).toHaveBeenCalledWith(1, 'dall-e-3');
      expect(mockGenerateImageChat).toHaveBeenCalledWith(expect.objectContaining({
        providerId: 1,
        modelId: 'dall-e-3',
        prompt: '画一只猫',
        size: '1024x1024',
        n: 2,
      }));
    });

    it('resolves image attachments from user message', async () => {
      const opts = {
        ...baseOpts,
        lastUserRow: {
          ...baseOpts.lastUserRow,
          attachments: [
            { type: 'image', path: '/img1.png' },
            { type: 'file', path: '/doc.pdf' },
            { type: 'image', path: '/img2.png' },
          ],
        },
      };
      await runImageStrategy(opts);

      expect(mockResolveImageDataUrl).toHaveBeenCalledTimes(2);
      expect(mockGenerateImageChat).toHaveBeenCalledWith(expect.objectContaining({
        imageDataUrls: ['data:image/png;base64,abc', 'data:image/png;base64,abc'],
      }));
    });

    it('passes seed when provided', async () => {
      await runImageStrategy({ ...baseOpts, seed: 42 });
      expect(mockGenerateImageChat).toHaveBeenCalledWith(expect.objectContaining({
        seed: 42,
      }));
    });

    it('passes undefined seed when null', async () => {
      await runImageStrategy({ ...baseOpts, seed: null });
      expect(mockGenerateImageChat).toHaveBeenCalledWith(expect.objectContaining({
        seed: undefined,
      }));
    });

    it('persists assistant message via onFinish callback', async () => {
      mockGenerateImageChat.mockImplementation(async (opts: any) => {
        const parts = [{ type: 'image', url: 'http://img.png' }];
        await opts.onFinish(parts);
      });
      await runImageStrategy(baseOpts);

      expect(mockPersistAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
        convId: 'conv1',
        messageId: 'msg1',
      }));
    });

    it('handles error via onError callback', async () => {
      mockGenerateImageChat.mockImplementation(async (opts: any) => {
        opts.onError(new Error('API failed'));
      });
      await runImageStrategy(baseOpts);

      expect(mockSetStreaming).toHaveBeenCalledWith('conv1', null);
      expect(mockPersistErrorMessage).toHaveBeenCalledWith('conv1', 'error detail');
    });
  });

  describe('runVideoStrategy', () => {
    const videoOpts = { ...baseOpts, modelId: 'sora' };

    it('sets mediaType to video on streaming state', async () => {
      await runVideoStrategy(videoOpts);

      expect(mockSetStreaming).toHaveBeenCalledWith('conv1', expect.objectContaining({
        mediaType: 'video',
      }));
    });

    it('calls generateVideoChat with correct params', async () => {
      await runVideoStrategy(videoOpts);

      expect(mockGenerateVideoChat).toHaveBeenCalledWith(expect.objectContaining({
        providerId: 1,
        modelId: 'sora',
        prompt: '画一只猫',
      }));
    });

    it('resolves only first image attachment for video', async () => {
      const opts = {
        ...videoOpts,
        lastUserRow: {
          ...baseOpts.lastUserRow,
          attachments: [
            { type: 'image', path: '/img1.png' },
            { type: 'image', path: '/img2.png' },
          ],
        },
      };
      await runVideoStrategy(opts);

      expect(mockResolveImageDataUrl).toHaveBeenCalledTimes(1);
      expect(mockGenerateVideoChat).toHaveBeenCalledWith(expect.objectContaining({
        imageDataUrl: 'data:image/png;base64,abc',
      }));
    });

    it('passes undefined imageDataUrl when no image attachments', async () => {
      await runVideoStrategy(videoOpts);
      expect(mockGenerateVideoChat).toHaveBeenCalledWith(expect.objectContaining({
        imageDataUrl: undefined,
      }));
    });

    it('handles error via onError callback', async () => {
      mockGenerateVideoChat.mockImplementation(async (opts: any) => {
        opts.onError(new Error('Video failed'));
      });
      await runVideoStrategy(videoOpts);

      expect(mockSetStreaming).toHaveBeenCalledWith('conv1', null);
      expect(mockPersistErrorMessage).toHaveBeenCalled();
    });
  });
});
