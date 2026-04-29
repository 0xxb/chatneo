import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockResolveProvider = vi.fn();

vi.mock('../providers/resolve', () => ({
  resolveProvider: (...args: unknown[]) => mockResolveProvider(...args),
}));

import { getImageSettings } from '../providers/get-image-settings';

describe('getImageSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty object when provider not found', async () => {
    mockResolveProvider.mockResolvedValueOnce(null);
    const result = await getImageSettings(999, 'model-1');
    expect(result).toEqual({});
  });

  it('returns empty object when config has no models', async () => {
    mockResolveProvider.mockResolvedValueOnce({
      providerType: 'openai',
      config: { apiKey: 'sk-test' },
    });
    const result = await getImageSettings(1, 'dall-e-3');
    expect(result).toEqual({});
  });

  it('returns empty object when model not in list', async () => {
    mockResolveProvider.mockResolvedValueOnce({
      providerType: 'openai',
      config: {
        models: [
          { modelId: 'other-model', imageSettings: { size: '512x512' } },
        ],
      },
    });
    const result = await getImageSettings(1, 'dall-e-3');
    expect(result).toEqual({});
  });

  it('returns imageSettings for matching model', async () => {
    const settings = { size: '1024x1024', n: 2, aspectRatio: '16:9' };
    mockResolveProvider.mockResolvedValueOnce({
      providerType: 'openai',
      config: {
        models: [
          { modelId: 'dall-e-2' },
          { modelId: 'dall-e-3', imageSettings: settings },
        ],
      },
    });
    const result = await getImageSettings(1, 'dall-e-3');
    expect(result).toEqual(settings);
  });

  it('returns empty object when model has no imageSettings', async () => {
    mockResolveProvider.mockResolvedValueOnce({
      providerType: 'openai',
      config: {
        models: [{ modelId: 'dall-e-3' }],
      },
    });
    const result = await getImageSettings(1, 'dall-e-3');
    expect(result).toEqual({});
  });

  it('passes providerId to resolveProvider', async () => {
    mockResolveProvider.mockResolvedValueOnce(null);
    await getImageSettings(42, 'model');
    expect(mockResolveProvider).toHaveBeenCalledWith(42);
  });
});
