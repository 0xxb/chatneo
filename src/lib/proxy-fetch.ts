import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { getSettingValue } from './apply-settings';

/**
 * Always use Tauri's native HTTP client to bypass browser CORS restrictions.
 * When proxy is configured, forward through the proxy.
 */
export function getNativeFetch(): typeof globalThis.fetch {
  const proxy = getSettingValue('proxy');

  return ((input: RequestInfo | URL, init?: RequestInit) =>
    tauriFetch(input, {
      ...init,
      ...(proxy ? { proxy: { all: proxy } } : {}),
    })) as typeof globalThis.fetch;
}

export const getProxyFetch = getNativeFetch;
