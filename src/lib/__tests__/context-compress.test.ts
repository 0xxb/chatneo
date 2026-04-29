import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils')>();
  return { ...actual };
});

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../providers', () => ({ resolveModelForPlugin: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn() }));
vi.mock('sonner', () => ({ toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() } }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { parseSummary, getUncompressedCount, KEEP_COUNT, MIN_MESSAGES_FOR_COMPRESS } from '../../plugins/context-compress/compress';

describe('context-compress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constants', () => {
    it('KEEP_COUNT is 4', () => {
      expect(KEEP_COUNT).toBe(4);
    });

    it('MIN_MESSAGES_FOR_COMPRESS is KEEP_COUNT + 2', () => {
      expect(MIN_MESSAGES_FOR_COMPRESS).toBe(KEEP_COUNT + 2);
    });
  });

  describe('parseSummary', () => {
    it('returns null for undefined', () => {
      expect(parseSummary(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseSummary('')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(parseSummary('{bad json')).toBeNull();
    });

    it('returns null when content is empty', () => {
      expect(parseSummary(JSON.stringify({ content: '', compressed_count: 5 }))).toBeNull();
    });

    it('returns null when compressed_count is 0', () => {
      expect(parseSummary(JSON.stringify({ content: '摘要', compressed_count: 0 }))).toBeNull();
    });

    it('parses valid summary', () => {
      const result = parseSummary(JSON.stringify({
        content: '这是一段摘要', compressed_count: 10, created_at: 1000,
      }));
      expect(result).toEqual({ content: '这是一段摘要', compressed_count: 10 });
    });

    it('does not include created_at in result', () => {
      const result = parseSummary(JSON.stringify({
        content: '摘要', compressed_count: 5, created_at: 1000,
      }));
      expect(result).not.toHaveProperty('created_at');
    });
  });

  describe('getUncompressedCount', () => {
    it('returns total when no summary', () => {
      expect(getUncompressedCount(20, undefined)).toBe(20);
    });

    it('returns total when summary is empty', () => {
      expect(getUncompressedCount(15, '')).toBe(15);
    });

    it('subtracts compressed count from total', () => {
      const summary = JSON.stringify({ content: '摘要', compressed_count: 8, created_at: 1000 });
      expect(getUncompressedCount(20, summary)).toBe(12);
    });

    it('returns 0 when all compressed', () => {
      const summary = JSON.stringify({ content: '摘要', compressed_count: 10, created_at: 1000 });
      expect(getUncompressedCount(10, summary)).toBe(0);
    });

    it('handles invalid summary JSON gracefully', () => {
      expect(getUncompressedCount(10, '{invalid')).toBe(10);
    });
  });
});
