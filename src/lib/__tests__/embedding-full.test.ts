import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEmbed = vi.fn();
const mockEmbedMany = vi.fn();
const mockResolveProvider = vi.fn();
const mockTextEmbeddingModel = vi.fn().mockReturnValue({ modelId: 'embed-model' });
const mockProvider = { textEmbeddingModel: mockTextEmbeddingModel };
const mockCreateOpenAI = vi.fn().mockReturnValue(mockProvider);
const mockCreateGoogle = vi.fn().mockReturnValue(mockProvider);
const mockCreateMistral = vi.fn().mockReturnValue(mockProvider);
const mockCreateCohere = vi.fn().mockReturnValue(mockProvider);
const mockCreateAlibaba = vi.fn().mockReturnValue(mockProvider);
const mockCreateOllama = vi.fn().mockReturnValue(mockProvider);

vi.mock('ai', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  embedMany: (...args: unknown[]) => mockEmbedMany(...args),
}));
vi.mock('../providers', () => ({
  resolveProvider: (...args: unknown[]) => mockResolveProvider(...args),
}));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: (...args: unknown[]) => mockCreateOpenAI(...args) }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: (...args: unknown[]) => mockCreateGoogle(...args) }));
vi.mock('@ai-sdk/mistral', () => ({ createMistral: (...args: unknown[]) => mockCreateMistral(...args) }));
vi.mock('@ai-sdk/cohere', () => ({ createCohere: (...args: unknown[]) => mockCreateCohere(...args) }));
vi.mock('@ai-sdk/alibaba', () => ({ createAlibaba: (...args: unknown[]) => mockCreateAlibaba(...args) }));
vi.mock('ollama-ai-provider-v2', () => ({ createOllama: (...args: unknown[]) => mockCreateOllama(...args) }));
vi.mock('../proxy-fetch', () => ({ getProxyFetch: () => globalThis.fetch }));
vi.mock('../providers/types', () => ({ resolveBaseURL: (config: any) => config.baseURL || '' }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { supportsEmbedding, generateEmbedding, generateEmbeddings } from '../embedding';

describe('embedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('supportsEmbedding', () => {
    it('returns true for native providers', () => {
      expect(supportsEmbedding('openai')).toBe(true);
      expect(supportsEmbedding('google')).toBe(true);
      expect(supportsEmbedding('mistral')).toBe(true);
      expect(supportsEmbedding('cohere')).toBe(true);
      expect(supportsEmbedding('aliyun')).toBe(true);
    });

    it('returns true for openai-compatible providers', () => {
      expect(supportsEmbedding('openai-compatible')).toBe(true);
      expect(supportsEmbedding('siliconflow')).toBe(true);
      expect(supportsEmbedding('deepseek')).toBe(true);
      expect(supportsEmbedding('volcengine')).toBe(true);
    });

    it('returns true for ollama', () => {
      expect(supportsEmbedding('ollama')).toBe(true);
    });

    it('returns false for unsupported providers', () => {
      expect(supportsEmbedding('anthropic')).toBe(false);
      expect(supportsEmbedding('unknown')).toBe(false);
      expect(supportsEmbedding('bedrock')).toBe(false);
    });
  });

  describe('generateEmbedding', () => {
    it('generates single embedding with resolved provider', async () => {
      mockResolveProvider.mockResolvedValueOnce({ providerType: 'openai', config: { apiKey: 'k' } });
      mockEmbed.mockResolvedValueOnce({ embedding: [0.1, 0.2, 0.3] });

      const result = await generateEmbedding(1, 'text-embedding-3-small', 'hello');
      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockEmbed).toHaveBeenCalledWith(expect.objectContaining({ value: 'hello' }));
    });

    it('uses ollama for null providerId', async () => {
      mockEmbed.mockResolvedValueOnce({ embedding: [0.5, 0.6] });

      const result = await generateEmbedding(null, 'nomic-embed', 'text');
      expect(result).toEqual([0.5, 0.6]);
      expect(mockCreateOllama).toHaveBeenCalled();
    });

    it('throws when provider not found', async () => {
      mockResolveProvider.mockResolvedValueOnce(null);
      await expect(generateEmbedding(99, 'model', 'text')).rejects.toThrow('未找到 Embedding 服务商');
    });
  });

  describe('generateEmbeddings', () => {
    it('generates batch embeddings', async () => {
      mockResolveProvider.mockResolvedValueOnce({ providerType: 'openai', config: { apiKey: 'k' } });
      mockEmbedMany.mockResolvedValueOnce({ embeddings: [[0.1, 0.2], [0.3, 0.4]] });

      const result = await generateEmbeddings(1, 'text-embedding-3-small', ['hello', 'world']);
      expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    });

    it('returns empty array for empty input', async () => {
      const result = await generateEmbeddings(1, 'model', []);
      expect(result).toEqual([]);
      expect(mockEmbedMany).not.toHaveBeenCalled();
    });

    it('uses ollama for null providerId', async () => {
      mockEmbedMany.mockResolvedValueOnce({ embeddings: [[1, 2]] });
      const result = await generateEmbeddings(null, 'nomic', ['text']);
      expect(result).toEqual([[1, 2]]);
    });
  });
});
