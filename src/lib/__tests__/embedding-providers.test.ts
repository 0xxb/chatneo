import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTextEmbeddingModel = vi.fn().mockReturnValue({ modelId: 'embed-model' });
const mockProvider = { textEmbeddingModel: mockTextEmbeddingModel };
const mockCreateOpenAI = vi.fn().mockReturnValue(mockProvider);
const mockCreateGoogle = vi.fn().mockReturnValue(mockProvider);
const mockCreateMistral = vi.fn().mockReturnValue(mockProvider);
const mockCreateCohere = vi.fn().mockReturnValue(mockProvider);
const mockCreateAlibaba = vi.fn().mockReturnValue(mockProvider);
const mockCreateOllama = vi.fn().mockReturnValue(mockProvider);
const mockResolveProvider = vi.fn();
const mockEmbed = vi.fn();
const mockEmbedMany = vi.fn();

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

import { generateEmbedding } from '../embedding';

describe('embedding — provider dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbed.mockResolvedValue({ embedding: [0.1] });
  });

  it('dispatches to openai-compatible provider (siliconflow)', async () => {
    mockResolveProvider.mockResolvedValueOnce({
      providerType: 'siliconflow',
      config: { providerType: 'siliconflow', apiKey: 'key', baseURL: 'https://api.sf.cn/v1' },
    });
    await generateEmbedding(1, 'bge-large', 'text');
    expect(mockCreateOpenAI).toHaveBeenCalled();
  });

  it('dispatches to ollama provider via resolved config', async () => {
    mockResolveProvider.mockResolvedValueOnce({
      providerType: 'ollama',
      config: { providerType: 'ollama', baseURL: 'http://localhost:11434' },
    });
    await generateEmbedding(2, 'nomic', 'text');
    expect(mockCreateOllama).toHaveBeenCalled();
  });

  it('dispatches to google provider', async () => {
    mockResolveProvider.mockResolvedValueOnce({
      providerType: 'google',
      config: { providerType: 'google', apiKey: 'key' },
    });
    await generateEmbedding(3, 'text-embedding', 'text');
    expect(mockCreateGoogle).toHaveBeenCalled();
  });

  it('throws for unsupported provider type', async () => {
    mockResolveProvider.mockResolvedValueOnce({
      providerType: 'anthropic',
      config: { providerType: 'anthropic', apiKey: 'key' },
    });
    await expect(generateEmbedding(4, 'model', 'text')).rejects.toThrow('不支持 Embedding');
  });
});
