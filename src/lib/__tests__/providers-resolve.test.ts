import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSetting = vi.fn();
const mockGetProviderConfig = vi.fn();

vi.mock('../dao/settings-dao', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
}));

vi.mock('../dao/provider-dao', () => ({
  getProviderConfig: (...args: unknown[]) => mockGetProviderConfig(...args),
}));

vi.mock('../utils', () => ({
  safeJsonParse: <T>(str: string, fallback: T): T => {
    try { return JSON.parse(str); } catch { return fallback; }
  },
}));

import { resolveProvider } from '../providers/resolve';

describe('resolveProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for providerId 0', async () => {
    const result = await resolveProvider(0);
    expect(result).toBeNull();
  });

  it('returns null for unknown negative builtin ID', async () => {
    const result = await resolveProvider(-99);
    expect(result).toBeNull();
  });

  it('resolves builtin ollama provider (id -1)', async () => {
    mockGetSetting.mockResolvedValue('{"baseURL":"http://localhost:11434"}');
    const result = await resolveProvider(-1);
    expect(result).not.toBeNull();
    expect(result!.providerType).toBe('ollama');
    expect(result!.config.baseURL).toBe('http://localhost:11434');
  });

  it('resolves builtin openai provider (id -2)', async () => {
    mockGetSetting.mockResolvedValue('{"apiKey":"sk-test"}');
    const result = await resolveProvider(-2);
    expect(result).not.toBeNull();
    expect(result!.providerType).toBe('openai');
    expect(result!.config.apiKey).toBe('sk-test');
  });

  it('resolves builtin anthropic provider (id -3)', async () => {
    mockGetSetting.mockResolvedValue('{"apiKey":"sk-ant-test"}');
    const result = await resolveProvider(-3);
    expect(result!.providerType).toBe('anthropic');
  });

  it('resolves builtin google provider (id -4)', async () => {
    mockGetSetting.mockResolvedValue('{}');
    const result = await resolveProvider(-4);
    expect(result!.providerType).toBe('google');
  });

  it('returns empty config when setting not found for builtin', async () => {
    mockGetSetting.mockResolvedValue(undefined);
    const result = await resolveProvider(-1);
    expect(result).not.toBeNull();
    expect(result!.providerType).toBe('ollama');
    expect(result!.config.providerType).toBe('ollama');
  });

  it('resolves custom DB provider (positive ID)', async () => {
    mockGetProviderConfig.mockResolvedValue({
      id: 5,
      type: 'openai-compatible',
      name: 'Custom',
      icon: '',
      config: '{"baseURL":"https://api.custom.com","apiKey":"key123"}',
      sort_order: 0,
    });
    const result = await resolveProvider(5);
    expect(result).not.toBeNull();
    expect(result!.providerType).toBe('openai-compatible');
    expect(result!.config.baseURL).toBe('https://api.custom.com');
  });

  it('returns null when DB provider not found', async () => {
    mockGetProviderConfig.mockResolvedValue(null);
    const result = await resolveProvider(999);
    expect(result).toBeNull();
  });
});
