import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockModel = { modelId: 'test-model', provider: 'test' };
const mockChat = vi.fn().mockReturnValue(mockModel);
const mockImageModel = vi.fn().mockReturnValue(mockModel);
const mockVideo = vi.fn().mockReturnValue(mockModel);
const mockProvider = vi.fn().mockReturnValue(mockModel);
Object.assign(mockProvider, { chat: mockChat, imageModel: mockImageModel });

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => Object.assign(mockProvider, { chat: mockChat, imageModel: mockImageModel })),
}));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => Object.assign(mockProvider, { imageModel: mockImageModel })) }));
vi.mock('@ai-sdk/azure', () => ({ createAzure: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/deepseek', () => ({ createDeepSeek: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/groq', () => ({ createGroq: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/perplexity', () => ({ createPerplexity: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/mistral', () => ({ createMistral: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/xai', () => ({ createXai: vi.fn(() => Object.assign(mockProvider, { imageModel: mockImageModel })) }));
vi.mock('@ai-sdk/togetherai', () => ({ createTogetherAI: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/fireworks', () => ({ createFireworks: vi.fn(() => Object.assign(mockProvider, { imageModel: mockImageModel })) }));
vi.mock('@ai-sdk/cerebras', () => ({ createCerebras: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/deepinfra', () => ({ createDeepInfra: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/cohere', () => ({ createCohere: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/alibaba', () => ({ createAlibaba: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/amazon-bedrock', () => ({ createAmazonBedrock: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/google-vertex/edge', () => ({ createVertex: vi.fn(() => mockProvider) }));
vi.mock('ollama-ai-provider-v2', () => ({ createOllama: vi.fn(() => mockProvider) }));
vi.mock('@ai-sdk/bytedance', () => ({ createByteDance: vi.fn(() => ({ video: mockVideo })) }));
vi.mock('../proxy-fetch', () => ({ getProxyFetch: () => globalThis.fetch }));
vi.mock('../providers/types', () => ({
  resolveBaseURL: (config: any) => config.baseURL || '',
}));
vi.mock('../providers/defaults', () => ({
  DEFAULT_BASE_URLS: {
    openrouter: 'https://openrouter.ai/api/v1',
    volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
    siliconflow: 'https://api.siliconflow.cn/v1',
  },
  DEFAULT_BEDROCK_REGION: 'us-east-1',
  DEFAULT_VERTEX_LOCATION: 'us-central1',
}));

const mockResolveProvider = vi.fn();
vi.mock('../providers/resolve', () => ({
  resolveProvider: (...args: unknown[]) => mockResolveProvider(...args),
}));
vi.mock('../providers/fetch-models', () => ({
  fetchModels: vi.fn(),
  canFetchModels: vi.fn(),
}));

import { createModel, createImageModel, resolveModelForPlugin } from '../providers';

describe('resolveModelForPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns model using plugin config provider/model', async () => {
    mockResolveProvider.mockResolvedValueOnce({
      config: { providerType: 'anthropic', apiKey: 'key' },
    });

    const result = await resolveModelForPlugin(
      { provider_id: 1, model_id: 'claude-3' },
      { provider_id: 2, model_id: 'gpt-4' },
    );
    expect(result).toBeDefined();
    expect(mockResolveProvider).toHaveBeenCalledWith(1);
  });

  it('falls back to conversation provider when plugin config is null', async () => {
    mockResolveProvider.mockResolvedValueOnce({
      config: { providerType: 'openai', apiKey: 'key' },
    });

    const result = await resolveModelForPlugin(
      { provider_id: null, model_id: '' },
      { provider_id: 5, model_id: 'gpt-4o' },
    );
    expect(result).toBeDefined();
    expect(mockResolveProvider).toHaveBeenCalledWith(5);
  });

  it('returns null when both provider IDs are null', async () => {
    const result = await resolveModelForPlugin(
      { provider_id: null, model_id: '' },
      { provider_id: null, model_id: 'model' },
    );
    expect(result).toBeNull();
  });

  it('returns null when provider not found', async () => {
    mockResolveProvider.mockResolvedValueOnce(null);

    const result = await resolveModelForPlugin(
      { provider_id: 99, model_id: 'model' },
      { provider_id: null, model_id: '' },
    );
    expect(result).toBeNull();
  });
});

describe('createImageModel — native SDK providers', () => {
  it('creates image model for native openai provider', () => {
    const result = createImageModel({ providerType: 'openai', apiKey: 'key' }, 'dall-e-3');
    expect(result).toBeDefined();
  });

  it('creates image model for google provider', () => {
    const result = createImageModel({ providerType: 'google', apiKey: 'key' }, 'imagen-3');
    expect(result).toBeDefined();
  });

  it('creates image model for xai provider', () => {
    const result = createImageModel({ providerType: 'xai', apiKey: 'key' }, 'grok-image');
    expect(result).toBeDefined();
  });

  it('creates image model for fireworks provider', () => {
    const result = createImageModel({ providerType: 'fireworks', apiKey: 'key' }, 'flux');
    expect(result).toBeDefined();
  });

  it('creates image model for openai-compatible (siliconflow)', () => {
    const result = createImageModel({ providerType: 'siliconflow', apiKey: 'key' }, 'flux');
    expect(result).toBeDefined();
  });
});

describe('createModel — additional coverage', () => {
  it('creates model for openai-compatible without explicit baseURL uses default', () => {
    const result = createModel({ providerType: 'siliconflow', apiKey: 'key' }, 'model');
    expect(result).toBeDefined();
  });

  it('throws for openai-compatible without baseURL or default', () => {
    expect(() => createModel({ providerType: 'openai-compatible' }, 'model'))
      .toThrow('需要配置 API 地址');
  });

  it('creates model for ollama with default URL', () => {
    const result = createModel({ providerType: 'ollama' }, 'llama3');
    expect(result).toBeDefined();
  });

  it('creates model with baseURL for native SDK provider', () => {
    const result = createModel({ providerType: 'openai', apiKey: 'key', baseURL: 'https://custom.com/v1' }, 'gpt-4');
    expect(result).toBeDefined();
  });
});
