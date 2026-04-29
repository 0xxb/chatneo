import { describe, it, expect, vi } from 'vitest';

const mockModel = { modelId: 'test-model', provider: 'test' };
const mockChat = vi.fn().mockReturnValue(mockModel);
const mockImageModel = vi.fn().mockReturnValue(mockModel);
const mockVideo = vi.fn().mockReturnValue(mockModel);
const mockProvider = vi.fn().mockReturnValue(mockModel);

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
vi.mock('./types', () => ({
  resolveBaseURL: (config: any) => config.baseURL || '',
}));
vi.mock('./defaults', () => ({
  DEFAULT_BASE_URLS: { openrouter: 'https://openrouter.ai/api/v1', volcengine: 'https://ark.cn-beijing.volces.com/api/v3' },
  DEFAULT_BEDROCK_REGION: 'us-east-1',
  DEFAULT_VERTEX_LOCATION: 'us-central1',
}));
vi.mock('./resolve', () => ({
  resolveProvider: vi.fn(),
}));
vi.mock('./fetch-models', () => ({
  fetchModels: vi.fn(),
  canFetchModels: vi.fn(),
}));

import { createModel, createImageModel, createVideoModel } from '../providers';

describe('providers/index.ts', () => {
  describe('createModel', () => {
    it('creates model for native SDK provider (anthropic)', () => {
      const result = createModel({ providerType: 'anthropic', apiKey: 'sk-test' }, 'claude-3');
      expect(result).toBeDefined();
    });

    it('creates model for ollama', () => {
      const result = createModel({ providerType: 'ollama', baseURL: 'http://localhost:11434' }, 'llama3');
      expect(result).toBeDefined();
    });

    it('creates model for openai-compatible with baseURL', () => {
      const result = createModel({ providerType: 'openrouter', apiKey: 'key' }, 'model');
      expect(result).toBeDefined();
    });

    it('creates model for azure-openai', () => {
      const result = createModel({
        providerType: 'azure-openai',
        apiKey: 'key',
        resourceName: 'myresource',
        apiVersion: '2024-01',
      }, 'gpt-4');
      expect(result).toBeDefined();
    });

    it('creates model for bedrock', () => {
      const result = createModel({
        providerType: 'bedrock',
        accessKeyId: 'AKIA...',
        secretAccessKey: 'secret',
        region: 'us-west-2',
      }, 'claude-3');
      expect(result).toBeDefined();
    });

    it('creates model for vertex', () => {
      const result = createModel({
        providerType: 'vertex',
        apiKey: 'key',
        project: 'my-project',
        location: 'europe-west1',
      }, 'gemini-pro');
      expect(result).toBeDefined();
    });

    it('throws for unsupported provider type', () => {
      expect(() => createModel({ providerType: 'unknown-xyz' }, 'model'))
        .toThrow('不支持的 provider 类型: unknown-xyz');
    });
  });

  describe('createImageModel', () => {
    it('creates image model for openai-compatible', () => {
      const result = createImageModel({ providerType: 'openrouter', apiKey: 'key' }, 'dall-e-3');
      expect(result).toBeDefined();
    });

    it('throws for unsupported provider', () => {
      expect(() => createImageModel({ providerType: 'unknown' }, 'model'))
        .toThrow('不支持图片生成');
    });
  });

  describe('createVideoModel', () => {
    it('creates video model for volcengine', () => {
      const result = createVideoModel({ providerType: 'volcengine', apiKey: 'key' }, 'video-model');
      expect(result).toBeDefined();
    });

    it('throws for unsupported provider', () => {
      expect(() => createVideoModel({ providerType: 'openai' }, 'model'))
        .toThrow('不支持视频生成');
    });
  });
});
