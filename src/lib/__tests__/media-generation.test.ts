import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateImage = vi.fn();
const mockGenerateVideo = vi.fn();
const mockResolveProvider = vi.fn();
const mockCreateImageModel = vi.fn().mockReturnValue({});
const mockCreateVideoModel = vi.fn().mockReturnValue({});
const mockSaveMediaFromBytes = vi.fn();
const mockDeleteAttachmentFile = vi.fn().mockResolvedValue(undefined);
const mockGuessMediaType = vi.fn();
const mockReadFile = vi.fn();
const mockInvoke = vi.fn();

vi.mock('ai', () => ({
  generateImage: (...args: unknown[]) => mockGenerateImage(...args),
  experimental_generateVideo: (...args: unknown[]) => mockGenerateVideo(...args),
}));
vi.mock('../providers', () => ({
  resolveProvider: (...args: unknown[]) => mockResolveProvider(...args),
  createImageModel: (...args: unknown[]) => mockCreateImageModel(...args),
  createVideoModel: (...args: unknown[]) => mockCreateVideoModel(...args),
}));
vi.mock('../attachments', () => ({
  saveMediaFromBytes: (...args: unknown[]) => mockSaveMediaFromBytes(...args),
  deleteAttachmentFile: (...args: unknown[]) => mockDeleteAttachmentFile(...args),
  guessMediaType: (...args: unknown[]) => mockGuessMediaType(...args),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  logApiRequest: vi.fn(),
}));

import { generateImageChat, generateVideoChat } from '../media-generation';

describe('generateImageChat', () => {
  const baseParams = {
    providerId: 1,
    modelId: 'dall-e-3',
    prompt: 'a cat',
    onFinish: vi.fn(),
    onError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProvider.mockResolvedValue({ providerType: 'openai', config: {} });
  });

  it('calls onError when provider not resolved', async () => {
    mockResolveProvider.mockResolvedValueOnce(null);
    await generateImageChat(baseParams);
    expect(baseParams.onError).toHaveBeenCalledWith(expect.objectContaining({ message: '未配置服务商' }));
  });

  it('generates image and calls onFinish', async () => {
    mockGenerateImage.mockResolvedValueOnce({
      images: [{ uint8Array: new Uint8Array([1, 2, 3]), mediaType: 'image/png' }],
    });
    mockSaveMediaFromBytes.mockResolvedValueOnce('/saved/img.png');

    await generateImageChat(baseParams);
    expect(mockCreateImageModel).toHaveBeenCalledWith({}, 'dall-e-3');
    expect(baseParams.onFinish).toHaveBeenCalledWith([
      { type: 'image', path: '/saved/img.png', mediaType: 'image/png' },
    ]);
  });

  it('generates multiple images', async () => {
    mockGenerateImage.mockResolvedValueOnce({
      images: [
        { uint8Array: new Uint8Array([1]), mediaType: 'image/png' },
        { uint8Array: new Uint8Array([2]), mediaType: 'image/png' },
      ],
    });
    mockSaveMediaFromBytes.mockResolvedValue('/saved/img.png');

    await generateImageChat({ ...baseParams, n: 2 });
    expect(baseParams.onFinish).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ type: 'image' }),
      expect.objectContaining({ type: 'image' }),
    ]));
  });

  it('calls onError when no images generated', async () => {
    mockGenerateImage.mockResolvedValueOnce({ images: [] });
    await generateImageChat(baseParams);
    expect(baseParams.onError).toHaveBeenCalledWith(expect.objectContaining({ message: '未生成任何图片' }));
  });

  it('silently returns on AbortError', async () => {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    mockGenerateImage.mockRejectedValueOnce(abortErr);

    await generateImageChat(baseParams);
    expect(baseParams.onError).not.toHaveBeenCalled();
    expect(baseParams.onFinish).not.toHaveBeenCalled();
  });

  it('calls onError on other errors', async () => {
    mockGenerateImage.mockRejectedValueOnce(new Error('API down'));
    await generateImageChat(baseParams);
    expect(baseParams.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'API down' }));
  });

  it('passes size and aspectRatio to generateImage', async () => {
    mockGenerateImage.mockResolvedValueOnce({ images: [{ uint8Array: new Uint8Array([1]), mediaType: 'image/png' }] });
    mockSaveMediaFromBytes.mockResolvedValueOnce('/img.png');

    await generateImageChat({ ...baseParams, size: '1024x1024', aspectRatio: '1:1', seed: 42 });
    expect(mockGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
      size: '1024x1024',
      aspectRatio: '1:1',
      seed: 42,
    }));
  });

  it('passes imageDataUrls as providerOptions', async () => {
    mockGenerateImage.mockResolvedValueOnce({ images: [{ uint8Array: new Uint8Array([1]), mediaType: 'image/png' }] });
    mockSaveMediaFromBytes.mockResolvedValueOnce('/img.png');

    await generateImageChat({ ...baseParams, imageDataUrls: ['data:image/png;base64,abc'] });
    expect(mockGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
      providerOptions: { openai: { image: 'data:image/png;base64,abc' } },
    }));
  });
});

describe('generateVideoChat', () => {
  const baseParams = {
    providerId: 1,
    modelId: 'sora',
    prompt: 'a bird',
    onFinish: vi.fn(),
    onError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProvider.mockResolvedValue({ providerType: 'openai', config: {} });
  });

  it('calls onError when provider not resolved', async () => {
    mockResolveProvider.mockResolvedValueOnce(null);
    await generateVideoChat(baseParams);
    expect(baseParams.onError).toHaveBeenCalledWith(expect.objectContaining({ message: '未配置服务商' }));
  });

  it('generates video and calls onFinish', async () => {
    mockInvoke.mockResolvedValueOnce('/downloaded/vid.mp4');
    mockReadFile.mockResolvedValueOnce(new Uint8Array([1, 2]));
    mockGuessMediaType.mockReturnValueOnce('video/mp4');

    mockGenerateVideo.mockImplementationOnce(async (opts: { download: (arg: { url: URL }) => Promise<unknown> }) => {
      await opts.download({ url: new URL('https://example.com/video.mp4') });
      return { videos: [{ mediaType: 'video/mp4' }] };
    });

    await generateVideoChat(baseParams);
    expect(baseParams.onFinish).toHaveBeenCalledWith([
      { type: 'video', path: '/downloaded/vid.mp4', mediaType: 'video/mp4' },
    ]);
  });

  it('calls onError when no videos generated', async () => {
    mockGenerateVideo.mockResolvedValueOnce({ videos: [] });
    await generateVideoChat(baseParams);
    expect(baseParams.onError).toHaveBeenCalledWith(expect.objectContaining({ message: '未生成任何视频' }));
  });

  it('silently returns on AbortError', async () => {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    mockGenerateVideo.mockRejectedValueOnce(abortErr);

    await generateVideoChat(baseParams);
    expect(baseParams.onError).not.toHaveBeenCalled();
  });

  it('cleans up downloaded files on error', async () => {
    mockInvoke.mockResolvedValue('/downloaded/vid.mp4');
    mockReadFile.mockResolvedValue(new Uint8Array([1]));
    mockGuessMediaType.mockReturnValue('video/mp4');

    mockGenerateVideo.mockImplementationOnce(async (opts: { download: (arg: { url: URL }) => Promise<unknown> }) => {
      await opts.download({ url: new URL('https://example.com/a.mp4') });
      throw new Error('processing failed');
    });

    await generateVideoChat(baseParams);
    expect(mockDeleteAttachmentFile).toHaveBeenCalledWith('/downloaded/vid.mp4');
    expect(baseParams.onError).toHaveBeenCalled();
  });

  it('passes imageDataUrl as image prompt', async () => {
    mockGenerateVideo.mockResolvedValueOnce({ videos: [{ mediaType: 'video/mp4' }] });
    mockInvoke.mockResolvedValue('/vid.mp4');

    await generateVideoChat({ ...baseParams, imageDataUrl: 'data:image/png;base64,abc' });
    expect(mockGenerateVideo).toHaveBeenCalledWith(expect.objectContaining({
      prompt: { image: 'data:image/png;base64,abc', text: 'a bird' },
    }));
  });
});
