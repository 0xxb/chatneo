import { describe, it, expect, vi } from 'vitest';

const mockTauriFetch = vi.fn().mockResolvedValue(new Response('ok'));
const mockGetSettingValue = vi.fn();

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (...args: unknown[]) => mockTauriFetch(...args),
}));
vi.mock('../apply-settings', () => ({
  getSettingValue: (...args: unknown[]) => mockGetSettingValue(...args),
}));

import { getNativeFetch, getProxyFetch } from '../proxy-fetch';

describe('proxy-fetch', () => {
  it('getNativeFetch returns a function', () => {
    mockGetSettingValue.mockReturnValue(undefined);
    const fetchFn = getNativeFetch();
    expect(typeof fetchFn).toBe('function');
  });

  it('calls tauriFetch without proxy when no setting', async () => {
    mockGetSettingValue.mockReturnValue(undefined);
    const fetchFn = getNativeFetch();
    await fetchFn('https://example.com');
    expect(mockTauriFetch).toHaveBeenCalledWith('https://example.com', {});
  });

  it('passes proxy config when proxy setting exists', async () => {
    mockGetSettingValue.mockReturnValue('http://proxy:8080');
    const fetchFn = getNativeFetch();
    await fetchFn('https://api.openai.com', { headers: { 'Authorization': 'Bearer key' } });
    expect(mockTauriFetch).toHaveBeenCalledWith('https://api.openai.com', {
      headers: { 'Authorization': 'Bearer key' },
      proxy: { all: 'http://proxy:8080' },
    });
  });

  it('getProxyFetch is same as getNativeFetch', () => {
    expect(getProxyFetch).toBe(getNativeFetch);
  });
});
