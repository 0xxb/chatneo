import { describe, it, expect, vi } from 'vitest';

vi.mock('../proxy-fetch', () => ({
  getNativeFetch: vi.fn(),
}));

vi.mock('./types', () => ({
  resolveBaseURL: vi.fn(),
}));

import { canFetchModels } from '../providers/fetch-models';

describe('canFetchModels', () => {
  it.each(['ollama', 'openai', 'anthropic', 'google', 'deepseek', 'openai-compatible', 'groq', 'openrouter'])(
    'returns true for %s',
    (provider) => { expect(canFetchModels(provider)).toBe(true); },
  );

  it.each(['unknown-provider', '', 'azure-openai'])(
    'returns false for "%s"',
    (provider) => { expect(canFetchModels(provider)).toBe(false); },
  );
});
