import { describe, it, expect, vi } from 'vitest';

const mockFetch = vi.fn();

vi.mock('../proxy-fetch', () => ({
  getNativeFetch: () => mockFetch,
}));
vi.mock('../providers/types', () => ({
  resolveBaseURL: (_cfg: unknown, fallback: string) => fallback,
}));

import { fetchModels } from '../providers/fetch-models';

describe('fetchModels — HTTP error branches', () => {
  it('throws on Google API error response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(
      fetchModels('google', { apiKey: 'test-key' }),
    ).rejects.toThrow('获取模型列表失败: 403');
  });

  it('throws on OpenRouter API error response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(
      fetchModels('openrouter', {}),
    ).rejects.toThrow('获取模型列表失败: 500');
  });

  it('throws on Cohere API error response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(
      fetchModels('cohere', { apiKey: 'test-key' }),
    ).rejects.toThrow('获取模型列表失败: 401');
  });

  it('Google adapter filters by generateContent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-pro', displayName: 'Gemini Pro', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 32000 },
          { name: 'models/embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    });
    const models = await fetchModels('google', { apiKey: 'key' });
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('gemini-pro');
  });

  it('OpenRouter adapter maps model fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 'openai/gpt-4', name: 'GPT-4', context_length: 8192, top_provider: { max_completion_tokens: 4096 } },
        ],
      }),
    });
    const models = await fetchModels('openrouter', {});
    expect(models[0]).toEqual({
      id: 'openai/gpt-4', name: 'GPT-4', contextLength: 8192, maxOutputTokens: 4096,
    });
  });
});
