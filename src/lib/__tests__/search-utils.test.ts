import { describe, it, expect, vi } from 'vitest';
import { extractDomain, extractSearchResults, safeOpenUrl } from '../search-utils';
import type { ToolCallData } from '../tool-call-types';

// Mock the Tauri opener plugin
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

describe('safeOpenUrl', () => {
  it('opens http URLs', async () => {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    safeOpenUrl('https://example.com');
    expect(openUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('opens http:// URLs', async () => {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    (openUrl as ReturnType<typeof vi.fn>).mockClear();
    safeOpenUrl('http://example.com');
    expect(openUrl).toHaveBeenCalledWith('http://example.com');
  });

  it('blocks non-http schemes', async () => {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    (openUrl as ReturnType<typeof vi.fn>).mockClear();
    safeOpenUrl('file:///etc/passwd');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('ignores invalid URLs', async () => {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    (openUrl as ReturnType<typeof vi.fn>).mockClear();
    safeOpenUrl('not a url');
    expect(openUrl).not.toHaveBeenCalled();
  });
});

describe('extractDomain', () => {
  it('extracts hostname from URL', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('www.example.com');
  });

  it('extracts hostname without www', () => {
    expect(extractDomain('https://example.com')).toBe('example.com');
  });

  it('returns empty string for invalid URL', () => {
    expect(extractDomain('not a url')).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(extractDomain('')).toBe('');
  });

  it('handles URL with port', () => {
    expect(extractDomain('http://localhost:3000/api')).toBe('localhost');
  });
});

describe('extractSearchResults', () => {
  it('extracts results from web-search tool calls', () => {
    const toolCalls: ToolCallData[] = [
      {
        id: '1',
        toolName: 'web-search',
        args: { query: 'test' },
        state: 'result',
        result: { results: [{ title: 'Test', url: 'https://test.com', content: 'content' }] },
      },
    ];
    const results = extractSearchResults(toolCalls);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Test');
  });

  it('parses string result as JSON', () => {
    const toolCalls: ToolCallData[] = [
      {
        id: '1',
        toolName: 'web-search',
        args: {},
        state: 'result',
        result: JSON.stringify({ results: [{ title: 'A', url: 'https://a.com', content: 'c' }] }),
      },
    ];
    expect(extractSearchResults(toolCalls)).toHaveLength(1);
  });

  it('ignores non-web-search tool calls', () => {
    const toolCalls: ToolCallData[] = [
      { id: '1', toolName: 'calculator', args: {}, state: 'result', result: { value: 42 } },
    ];
    expect(extractSearchResults(toolCalls)).toEqual([]);
  });

  it('ignores calling state', () => {
    const toolCalls: ToolCallData[] = [
      { id: '1', toolName: 'web-search', args: {}, state: 'calling' },
    ];
    expect(extractSearchResults(toolCalls)).toEqual([]);
  });

  it('handles invalid JSON string gracefully', () => {
    const toolCalls: ToolCallData[] = [
      { id: '1', toolName: 'web-search', args: {}, state: 'result', result: 'not json' },
    ];
    expect(extractSearchResults(toolCalls)).toEqual([]);
  });

  it('handles empty tool calls array', () => {
    expect(extractSearchResults([])).toEqual([]);
  });

  it('merges results from multiple web-search calls', () => {
    const toolCalls: ToolCallData[] = [
      {
        id: '1', toolName: 'web-search', args: {}, state: 'result',
        result: { results: [{ title: 'A', url: 'a', content: 'a' }] },
      },
      {
        id: '2', toolName: 'web-search', args: {}, state: 'result',
        result: { results: [{ title: 'B', url: 'b', content: 'b' }] },
      },
    ];
    expect(extractSearchResults(toolCalls)).toHaveLength(2);
  });
});
