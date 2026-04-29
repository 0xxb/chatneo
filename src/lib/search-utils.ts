import { openUrl } from '@tauri-apps/plugin-opener';
import type { SearchResultItem } from './types/chat-message';
import type { ToolCallData } from './tool-call-types';

const SAFE_SCHEMES = new Set(['http:', 'https:']);

/** Open a URL only if it uses http/https scheme. */
export function safeOpenUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (SAFE_SCHEMES.has(parsed.protocol)) {
      openUrl(url);
    }
  } catch {
    // invalid URL, ignore
  }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function extractSearchResults(toolCalls: ToolCallData[]): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  for (const tc of toolCalls) {
    if (tc.toolName === 'web-search' && tc.state === 'result' && tc.result) {
      let raw = tc.result;
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { continue; }
      }
      const r = raw as { results?: SearchResultItem[] };
      if (Array.isArray(r.results)) results.push(...r.results);
    }
  }
  return results;
}
