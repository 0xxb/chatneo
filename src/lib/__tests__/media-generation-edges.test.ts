import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockResolveProvider = vi.fn();
const mockCreateImageModel = vi.fn().mockReturnValue({});
const mockGenerateImage = vi.fn();

vi.mock('ai', () => ({
  generateImage: (...args: unknown[]) => mockGenerateImage(...args),
  experimental_generateVideo: vi.fn(),
}));
vi.mock('../providers', () => ({
  resolveProvider: (...args: unknown[]) => mockResolveProvider(...args),
  createImageModel: (...args: unknown[]) => mockCreateImageModel(...args),
  createVideoModel: vi.fn().mockReturnValue({}),
}));
vi.mock('../attachments', () => ({
  saveMediaFromBytes: vi.fn().mockResolvedValue('/img.png'),
  deleteAttachmentFile: vi.fn().mockResolvedValue(undefined),
  guessMediaType: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  logApiRequest: vi.fn(),
}));

import { generateImageChat } from '../media-generation';

describe('media-generation — error edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProvider.mockResolvedValue({ providerType: 'openai', config: {} });
  });

  it('converts non-Error thrown value to Error via toError', async () => {
    // Throw a plain string — should be converted to Error
    mockGenerateImage.mockRejectedValueOnce('raw string error');
    const onError = vi.fn();
    await generateImageChat({
      providerId: 1, modelId: 'dall-e-3', prompt: 'test',
      onFinish: vi.fn(), onError,
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe('raw string error');
  });

  it('converts object thrown value via stringifyError JSON path', async () => {
    mockGenerateImage.mockRejectedValueOnce({ code: 'ERR', detail: 'bad request' });
    const onError = vi.fn();
    await generateImageChat({
      providerId: 1, modelId: 'dall-e-3', prompt: 'test',
      onFinish: vi.fn(), onError,
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toContain('ERR');
  });

  it('handles non-serializable thrown value via String() fallback', async () => {
    // Circular reference — JSON.stringify will fail
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    mockGenerateImage.mockRejectedValueOnce(circular);
    const onError = vi.fn();
    await generateImageChat({
      providerId: 1, modelId: 'dall-e-3', prompt: 'test',
      onFinish: vi.fn(), onError,
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    // String(circular) produces "[object Object]"
    expect(onError.mock.calls[0][0].message).toBe('[object Object]');
  });

  it('passes multiple imageDataUrls as array', async () => {
    mockGenerateImage.mockResolvedValueOnce({
      images: [{ uint8Array: new Uint8Array([1]), mediaType: 'image/png' }],
    });
    const onFinish = vi.fn();
    await generateImageChat({
      providerId: 1, modelId: 'dall-e-3', prompt: 'edit',
      imageDataUrls: ['data:img1', 'data:img2'],
      onFinish, onError: vi.fn(),
    });
    expect(mockGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
      providerOptions: { openai: { image: ['data:img1', 'data:img2'] } },
    }));
  });
});
