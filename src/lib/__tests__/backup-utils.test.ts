import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
  message: vi.fn(),
  ask: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readDir: vi.fn(),
  exists: vi.fn(),
}));
vi.mock('../db', () => ({
  getDb: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../attachments', () => ({
  ensureAttachmentsDir: vi.fn().mockResolvedValue('/attachments'),
}));
vi.mock('../../locales', () => ({
  default: { t: (k: string) => k },
}));
vi.mock('../restore', () => ({
  parseBackupFile: vi.fn(),
  restoreBackup: vi.fn(),
}));

import { basename, rewriteMediaPaths, getCategoryLabel, ALL_CATEGORIES } from '../backup';

describe('backup utilities', () => {
  describe('basename', () => {
    it('extracts filename from unix path', () => {
      expect(basename('/Users/test/file.zip')).toBe('file.zip');
    });

    it('extracts filename from windows path', () => {
      expect(basename('C:\\Users\\test\\file.zip')).toBe('file.zip');
    });

    it('returns filename if no separators', () => {
      expect(basename('file.zip')).toBe('file.zip');
    });

    it('handles mixed separators', () => {
      expect(basename('/path\\to/mixed\\file.txt')).toBe('file.txt');
    });

    it('handles trailing separator', () => {
      expect(basename('/path/to/')).toBe('');
    });

    it('handles empty string', () => {
      expect(basename('')).toBe('');
    });
  });

  describe('rewriteMediaPaths', () => {
    it('returns empty/falsy values unchanged', () => {
      expect(rewriteMediaPaths('', (p) => p)).toBe('');
      expect(rewriteMediaPaths(null as any, (p) => p)).toBe(null);
    });

    it('rewrites paths in image parts', () => {
      const parts = JSON.stringify([
        { type: 'image', path: '/old/path/img.png' },
        { type: 'image', path: '/old/path/img2.png' },
      ]);
      const result = rewriteMediaPaths(parts, (p) => p.replace('/old/', '/new/'));
      const parsed = JSON.parse(result);
      expect(parsed[0].path).toBe('/new/path/img.png');
      expect(parsed[1].path).toBe('/new/path/img2.png');
    });

    it('rewrites paths in text parts', () => {
      const parts = JSON.stringify([{ type: 'text', path: '/a/b.txt' }]);
      const result = rewriteMediaPaths(parts, () => '/new/b.txt');
      expect(JSON.parse(result)[0].path).toBe('/new/b.txt');
    });

    it('returns unchanged if no path modification needed', () => {
      const parts = JSON.stringify([{ type: 'image', path: '/same/path.png' }]);
      const result = rewriteMediaPaths(parts, (p) => p);
      expect(result).toBe(parts); // Same reference/string since no changes
    });

    it('returns unchanged for non-media parts', () => {
      const parts = JSON.stringify([{ type: 'tool_call', id: 't1' }]);
      const result = rewriteMediaPaths(parts, () => '/rewritten');
      expect(result).toBe(parts);
    });

    it('returns unchanged for invalid JSON', () => {
      const invalid = 'not json {{{';
      expect(rewriteMediaPaths(invalid, () => '/x')).toBe(invalid);
    });

    it('returns unchanged for empty array', () => {
      const empty = '[]';
      expect(rewriteMediaPaths(empty, () => '/x')).toBe(empty);
    });

    it('skips parts without path property', () => {
      const parts = JSON.stringify([{ type: 'image', content: 'base64...' }]);
      const result = rewriteMediaPaths(parts, () => '/rewritten');
      expect(result).toBe(parts);
    });
  });

  describe('getCategoryLabel', () => {
    it('returns i18n key for each category', () => {
      expect(getCategoryLabel('conversations')).toBe('settings.data.categoryConversations');
      expect(getCategoryLabel('settings')).toBe('settings.data.categorySettings');
      expect(getCategoryLabel('providers')).toBe('settings.data.categoryProviders');
    });
  });

  describe('ALL_CATEGORIES', () => {
    it('contains all 8 categories', () => {
      expect(ALL_CATEGORIES).toHaveLength(8);
      expect(ALL_CATEGORIES).toContain('conversations');
      expect(ALL_CATEGORIES).toContain('settings');
      expect(ALL_CATEGORIES).toContain('providers');
      expect(ALL_CATEGORIES).toContain('prompts');
      expect(ALL_CATEGORIES).toContain('plugins');
      expect(ALL_CATEGORIES).toContain('mcp_servers');
      expect(ALL_CATEGORIES).toContain('model_favorites');
      expect(ALL_CATEGORIES).toContain('knowledge_bases');
    });
  });
});
