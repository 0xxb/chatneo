import { describe, it, expect, vi } from 'vitest';

vi.mock('ai', () => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
}));

vi.mock('../providers', () => ({
  resolveProvider: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn() }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn() }));
vi.mock('@ai-sdk/mistral', () => ({ createMistral: vi.fn() }));
vi.mock('@ai-sdk/cohere', () => ({ createCohere: vi.fn() }));
vi.mock('@ai-sdk/alibaba', () => ({ createAlibaba: vi.fn() }));
vi.mock('ollama-ai-provider-v2', () => ({ createOllama: vi.fn() }));
vi.mock('../proxy-fetch', () => ({ getProxyFetch: vi.fn(() => fetch) }));
vi.mock('../providers/types', () => ({ resolveBaseURL: vi.fn() }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { supportsEmbedding } from '../embedding';

describe('supportsEmbedding', () => {
  it.each(['openai', 'google', 'ollama', 'openai-compatible', 'mistral', 'cohere', 'siliconflow', 'deepseek', 'aliyun'])(
    'returns true for %s',
    (provider) => { expect(supportsEmbedding(provider)).toBe(true); },
  );

  it.each(['anthropic', 'unknown', ''])(
    'returns false for "%s"',
    (provider) => { expect(supportsEmbedding(provider)).toBe(false); },
  );
});
