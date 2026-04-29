import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';

const mockSelect = vi.fn().mockResolvedValue([]);
const mockDb = { select: mockSelect };

vi.mock('../db', () => ({
  getDb: () => Promise.resolve(mockDb),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn().mockResolvedValue('/output/backup.zip'),
  message: vi.fn().mockResolvedValue(undefined),
  ask: vi.fn().mockResolvedValue(true),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readDir: vi.fn().mockResolvedValue([]),
  exists: vi.fn().mockResolvedValue(false),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../attachments', () => ({
  ensureAttachmentsDir: vi.fn().mockResolvedValue('/app/attachments'),
}));
vi.mock('../../locales', () => ({
  default: { t: (k: string) => k },
}));
vi.mock('../restore', () => ({
  parseBackupFile: vi.fn(),
  restoreBackup: vi.fn(),
}));

import { createBackupBlob, basename, rewriteMediaPaths, getCategoryLabel, ALL_CATEGORIES } from '../backup';

describe('basename', () => {
  it('extracts filename from unix path', () => {
    expect(basename('/path/to/file.txt')).toBe('file.txt');
  });

  it('extracts filename from windows path', () => {
    expect(basename('C:\\Users\\test\\file.txt')).toBe('file.txt');
  });

  it('returns filename when no path separator', () => {
    expect(basename('file.txt')).toBe('file.txt');
  });
});

describe('rewriteMediaPaths', () => {
  it('returns unchanged for empty string', () => {
    expect(rewriteMediaPaths('', (p) => p)).toBe('');
  });

  it('returns unchanged for invalid JSON', () => {
    expect(rewriteMediaPaths('not json', (p) => p)).toBe('not json');
  });

  it('returns unchanged for non-media type array', () => {
    const json = JSON.stringify([{ type: 'tool_call', path: '/old/path.txt' }]);
    expect(rewriteMediaPaths(json, () => 'new.txt')).toBe(json);
  });

  it('rewrites paths for image type', () => {
    const json = JSON.stringify([{ type: 'image', path: '/old/photo.png' }]);
    const result = rewriteMediaPaths(json, (p) => p.split('/').pop()!);
    const parsed = JSON.parse(result);
    expect(parsed[0].path).toBe('photo.png');
  });

  it('rewrites paths for video type', () => {
    const json = JSON.stringify([{ type: 'video', path: '/old/clip.mp4' }]);
    const result = rewriteMediaPaths(json, (p) => p.split('/').pop()!);
    expect(JSON.parse(result)[0].path).toBe('clip.mp4');
  });

  it('handles multiple parts with mixed paths', () => {
    const json = JSON.stringify([
      { type: 'image', path: '/old/a.png' },
      { type: 'image', path: '/old/b.png' },
    ]);
    const result = rewriteMediaPaths(json, (p) => p.split('/').pop()!);
    const parsed = JSON.parse(result);
    expect(parsed[0].path).toBe('a.png');
    expect(parsed[1].path).toBe('b.png');
  });

  it('returns unchanged when rewrite produces same path', () => {
    const json = JSON.stringify([{ type: 'image', path: 'same.png' }]);
    const result = rewriteMediaPaths(json, (p) => p);
    expect(result).toBe(json);
  });

  it('skips parts without path property', () => {
    const json = JSON.stringify([{ type: 'text', content: 'hello' }]);
    const result = rewriteMediaPaths(json, () => 'new');
    expect(result).toBe(json);
  });
});

describe('getCategoryLabel', () => {
  it('returns i18n key for each category', () => {
    for (const cat of ALL_CATEGORIES) {
      const label = getCategoryLabel(cat);
      expect(label).toContain('settings.data.category');
    }
  });
});

describe('createBackupBlob — conversations with attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue([]);
  });

  it('includes attachment info in conversation backup', async () => {
    // conversations
    mockSelect.mockResolvedValueOnce([{ id: 'c1', title: '对话' }]);
    // messages
    mockSelect.mockResolvedValueOnce([{
      id: 'm1', conversation_id: 'c1', content: '看图', parts: '',
    }]);
    // attachments
    mockSelect.mockResolvedValueOnce([{
      id: 'a1', message_id: 'm1', type: 'image', name: 'pic.png',
      path: '/full/path/pic.png', thumbnail_path: '/full/path/thumb.png', created_at: 1000,
    }]);

    const blob = await createBackupBlob(['conversations']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/conversations.json')!.async('text'));

    expect(data[0].messages[0].attachments).toHaveLength(1);
    // Path should be basename only
    expect(data[0].messages[0].attachments[0].path).toBe('pic.png');
    expect(data[0].messages[0].attachments[0].thumbnail_path).toBe('thumb.png');
  });

  it('rewrites media parts paths in messages', async () => {
    const parts = JSON.stringify([{ type: 'image', path: '/full/path/gen.png' }]);
    mockSelect.mockResolvedValueOnce([{ id: 'c1', title: '对话' }]);
    mockSelect.mockResolvedValueOnce([{
      id: 'm1', conversation_id: 'c1', content: 'img', parts,
    }]);
    mockSelect.mockResolvedValueOnce([]);

    const blob = await createBackupBlob(['conversations']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/conversations.json')!.async('text'));
    const rewrittenParts = JSON.parse(data[0].messages[0].parts);
    expect(rewrittenParts[0].path).toBe('gen.png');
  });

  it('normalizes chat_bg_image path in settings backup', async () => {
    mockSelect.mockResolvedValueOnce([
      { key: 'theme', value: 'dark' },
      { key: 'chat_bg_image', value: '/full/path/bg.jpg' },
    ]);

    const blob = await createBackupBlob(['settings']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/settings.json')!.async('text'));
    const bgRow = data.find((r: any) => r.key === 'chat_bg_image');
    expect(bgRow.value).toBe('bg.jpg');
  });

  it('keeps preset chat_bg_image value unchanged', async () => {
    mockSelect.mockResolvedValueOnce([
      { key: 'chat_bg_image', value: 'preset:aurora' },
    ]);

    const blob = await createBackupBlob(['settings']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/settings.json')!.async('text'));
    expect(data[0].value).toBe('preset:aurora');
  });

  it('creates backup for mcp_servers', async () => {
    mockSelect.mockResolvedValueOnce([{ id: 's1', name: 'MCP Server', transport: 'stdio' }]);
    const blob = await createBackupBlob(['mcp_servers']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/mcp_servers.json')!.async('text'));
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('MCP Server');
  });

  it('creates backup for model_favorites', async () => {
    mockSelect.mockResolvedValueOnce([{ id: 1, provider_id: -2, model_id: 'gpt-4' }]);
    const blob = await createBackupBlob(['model_favorites']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/model_favorites.json')!.async('text'));
    expect(data).toHaveLength(1);
  });

  it('creates backup for plugins', async () => {
    mockSelect.mockResolvedValueOnce([{ id: 'p1', enabled: 1, config: '{}' }]);
    const blob = await createBackupBlob(['plugins']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/plugins.json')!.async('text'));
    expect(data).toHaveLength(1);
  });

  it('includes stats for conversations with message/attachment counts', async () => {
    mockSelect.mockResolvedValueOnce([{ id: 'c1', title: '对话' }]);
    mockSelect.mockResolvedValueOnce([
      { id: 'm1', conversation_id: 'c1', content: 'hi', parts: '' },
      { id: 'm2', conversation_id: 'c1', content: 'hello', parts: '' },
    ]);
    mockSelect.mockResolvedValueOnce([
      { id: 'a1', message_id: 'm1', type: 'image', name: 'pic.png', path: 'pic.png', created_at: 1 },
    ]);

    const blob = await createBackupBlob(['conversations']);
    const zip = await JSZip.loadAsync(blob);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
    expect(manifest.stats.conversations).toBe(1);
    expect(manifest.stats.messages).toBe(2);
    expect(manifest.stats.attachments).toBe(1);
  });
});
