import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();

vi.mock('../proxy-fetch', () => ({
  getNativeFetch: () => mockFetch,
}));
vi.mock('../providers/types', () => ({
  resolveBaseURL: (config: any, fallback?: string) => config.baseURL || fallback || '',
}));

import { fetchModels } from '../providers/fetch-models';

describe('fetchModels (adapters)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws for unsupported provider', async () => {
    await expect(fetchModels('unsupported', {}))
      .rejects.toThrow('不支持自动获取模型');
  });

  describe('ollama adapter', () => {
    it('fetches models from /api/tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3' }, { name: 'mistral' }] }),
      });

      const models = await fetchModels('ollama', { baseURL: 'http://localhost:11434' });
      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({ id: 'llama3', name: 'llama3' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(fetchModels('ollama', {})).rejects.toThrow('Ollama 连接失败: 500');
    });
  });

  describe('openai-compatible adapter', () => {
    it('fetches models from /models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }] }),
      });

      const models = await fetchModels('openai', { apiKey: 'sk-test', baseURL: 'https://api.openai.com/v1' });
      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({ id: 'gpt-4', name: 'gpt-4' });
    });

    it('throws on missing baseURL', async () => {
      await expect(fetchModels('openai-compatible', { apiKey: 'k' })).rejects.toThrow('缺少 Base URL');
    });

    it('throws on missing apiKey', async () => {
      await expect(fetchModels('openai', { baseURL: 'http://x' })).rejects.toThrow('缺少 API Key');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      await expect(fetchModels('deepseek', { apiKey: 'k', baseURL: 'https://api.deepseek.com/v1' }))
        .rejects.toThrow('获取模型列表失败: 401');
    });

    it('handles empty data array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });
      const models = await fetchModels('groq', { apiKey: 'k', baseURL: 'https://api.groq.com/openai/v1' });
      expect(models).toEqual([]);
    });
  });

  describe('anthropic adapter', () => {
    it('fetches with pagination', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: 'claude-3-opus', display_name: 'Claude 3 Opus' }],
            has_more: true,
            last_id: 'claude-3-opus',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: 'claude-3-sonnet' }],
            has_more: false,
          }),
        });

      const models = await fetchModels('anthropic', { apiKey: 'sk-ant' });
      expect(models).toHaveLength(2);
      expect(models[0].name).toBe('Claude 3 Opus');
      expect(models[1].name).toBe('claude-3-sonnet');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws on missing apiKey', async () => {
      await expect(fetchModels('anthropic', {})).rejects.toThrow('缺少 API Key');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
      await expect(fetchModels('anthropic', { apiKey: 'k' })).rejects.toThrow('获取模型列表失败: 403');
    });
  });

  describe('google adapter', () => {
    it('filters by generateContent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'models/gemini-pro', displayName: 'Gemini Pro', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 32000, outputTokenLimit: 8192 },
            { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
          ],
        }),
      });

      const models = await fetchModels('google', { apiKey: 'key' });
      expect(models).toHaveLength(1);
      expect(models[0]).toEqual({ id: 'gemini-pro', name: 'Gemini Pro', contextLength: 32000, maxOutputTokens: 8192 });
    });

    it('throws on missing apiKey', async () => {
      await expect(fetchModels('google', {})).rejects.toThrow('缺少 API Key');
    });

    it('handles null models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: null }),
      });
      const models = await fetchModels('google', { apiKey: 'k' });
      expect(models).toEqual([]);
    });
  });

  describe('openrouter adapter', () => {
    it('fetches with rich metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'openai/gpt-4', name: 'GPT-4', context_length: 128000, top_provider: { max_completion_tokens: 4096 } }],
        }),
      });

      const models = await fetchModels('openrouter', {});
      expect(models[0]).toEqual({ id: 'openai/gpt-4', name: 'GPT-4', contextLength: 128000, maxOutputTokens: 4096 });
    });
  });

  describe('cohere adapter', () => {
    it('fetches chat models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [{ name: 'command-r-plus', context_length: 128000 }],
        }),
      });

      const models = await fetchModels('cohere', { apiKey: 'key' });
      expect(models[0]).toEqual({ id: 'command-r-plus', name: 'command-r-plus', contextLength: 128000 });
    });

    it('throws on missing apiKey', async () => {
      await expect(fetchModels('cohere', {})).rejects.toThrow('缺少 API Key');
    });
  });

  describe('timeout handling', () => {
    it('wraps AbortError as timeout message', async () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(err);
      await expect(fetchModels('ollama', {})).rejects.toThrow('获取模型列表超时');
    });
  });
});
