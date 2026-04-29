import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';

const mockOpen = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockExecute = vi.fn().mockResolvedValue({ rowsAffected: 0 });
const mockDbSelect = vi.fn().mockResolvedValue([]);
const mockEmit = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
  message: vi.fn().mockResolvedValue(undefined),
  ask: vi.fn().mockResolvedValue(true),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));
vi.mock('../db', () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
  }),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../attachments', () => ({
  ensureAttachmentsDir: vi.fn().mockResolvedValue('/app/attachments'),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}));
vi.mock('../../locales', () => ({
  default: { t: (k: string) => k },
}));
vi.mock('../backup', () => ({
  getCategoryLabel: (cat: string) => cat,
  basename: (p: string) => p.split('/').pop() ?? p,
  rewriteMediaPaths: (json: string) => json,
}));
vi.mock('../../store/chat', () => ({
  useChatStore: {
    getState: () => ({
      loadConversations: vi.fn().mockResolvedValue(undefined),
      loadArchivedConversations: vi.fn().mockResolvedValue(undefined),
      newChat: vi.fn(),
    }),
  },
}));
vi.mock('../webdav-scheduler', () => ({
  restartScheduler: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../mcp-manager', () => ({
  mcpManager: { disconnectAll: vi.fn().mockResolvedValue(undefined), connectAll: vi.fn().mockResolvedValue(undefined) },
}));

import { parseBackupFile, restoreBackup } from '../restore';
import { ask } from '@tauri-apps/plugin-dialog';
import { logger } from '../logger';

async function makePreview(categories: string[], dataFiles: Record<string, unknown[]>, extraFiles?: Record<string, Uint8Array>) {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    version: 1, app: 'ChatNeo', created_at: '2024-01-01', categories, stats: {},
  }));
  for (const [name, data] of Object.entries(dataFiles)) {
    zip.file(`data/${name}.json`, JSON.stringify(data));
  }
  if (extraFiles) {
    for (const [path, bytes] of Object.entries(extraFiles)) {
      zip.file(path, bytes);
    }
  }
  return {
    manifest: { version: 1, app: 'ChatNeo', created_at: '2024-01-01', categories, stats: {} as Record<string, number> },
    zip,
  };
}

describe('restoreBackup — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rowsAffected: 0 });
    mockDbSelect.mockResolvedValue([]);
  });

  it('skips missing data file and continues', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    // manifest says 'settings' but ZIP has no data/settings.json
    const preview = await makePreview(['settings'], {});
    // Remove the data file that was just added
    preview.zip.remove('data/settings.json');

    const result = await restoreBackup(preview as any);
    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith('backup', expect.stringContaining('缺少 settings.json'));
  });

  it('restores attachments from ZIP when present', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(
      ['conversations'],
      { conversations: [] },
      { 'attachments/pic.png': new Uint8Array([1, 2, 3]) },
    );

    await restoreBackup(preview as any);
    expect(mockWriteFile).toHaveBeenCalledWith('/app/attachments/pic.png', expect.any(Uint8Array));
  });

  it('does not call restoreAttachments when no attachment files in ZIP', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(['conversations'], { conversations: [] });

    await restoreBackup(preview as any);
    // writeFile should not be called for attachments
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('emits settings-changed events after restoring settings', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    mockDbSelect.mockResolvedValueOnce([
      { key: 'theme', value: 'dark' },
      { key: 'font_size', value: 'large' },
    ]);
    const preview = await makePreview(['settings'], {
      settings: [{ key: 'theme', value: 'dark' }, { key: 'font_size', value: 'large' }],
    });

    await restoreBackup(preview as any);
    expect(mockEmit).toHaveBeenCalledWith('settings-changed', { key: 'theme', value: 'dark' });
    expect(mockEmit).toHaveBeenCalledWith('settings-changed', { key: 'font_size', value: 'large' });
  });

  it('handles runtime refresh failure gracefully', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    // Make the settings DB select throw to simulate runtime refresh failure
    mockDbSelect.mockRejectedValueOnce(new Error('select failed'));
    const preview = await makePreview(['settings'], {
      settings: [{ key: 'theme', value: 'dark' }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith('backup', expect.stringContaining('刷新运行时状态部分失败'));
  });

  it('restores model_favorites category', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(['model_favorites'], {
      model_favorites: [{ model_id: 'gpt-4', provider_id: 1, created_at: 1000 }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM model_favorites');
  });

  it('restores plugins category', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(['plugins'], {
      plugins: [{ id: 'p1', enabled: 1, config: '{}' }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM plugins');
  });

  it('resets provider AUTOINCREMENT after restore', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(['providers'], {
      providers: [{ id: 10, type: 'openai', icon: '', name: 'OpenAI', config: '{}', sort_order: 0 }],
    });

    await restoreBackup(preview as any);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('sqlite_sequence'),
    );
  });

  it('restores settings with custom bg image path rewrite', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(['settings'], {
      settings: [{ key: 'chat_bg_image', value: 'bg.jpg' }],
    });

    await restoreBackup(preview as any);
    // bg.jpg (filename without /) should be rewritten to full path
    expect(mockExecute).toHaveBeenCalledWith(
      'INSERT INTO settings (key, value) VALUES (?, ?)',
      ['chat_bg_image', '/app/attachments/bg.jpg'],
    );
  });
});

describe('parseBackupFile — stats fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to counting from data files when stats is null', async () => {
    mockOpen.mockResolvedValueOnce('/path/backup.zip');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 1, app: 'ChatNeo', categories: ['prompts'], stats: null,
    }));
    zip.file('data/prompts.json', JSON.stringify([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]));
    mockReadFile.mockResolvedValueOnce(await zip.generateAsync({ type: 'uint8array' }));

    const result = await parseBackupFile();
    expect(result!.manifest.stats.prompts).toBe(3);
  });

  it('handles invalid JSON in data file during stats fallback', async () => {
    mockOpen.mockResolvedValueOnce('/path/backup.zip');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 1, app: 'ChatNeo', categories: ['settings'], stats: {},
    }));
    zip.file('data/settings.json', 'not json');
    mockReadFile.mockResolvedValueOnce(await zip.generateAsync({ type: 'uint8array' }));

    const result = await parseBackupFile();
    expect(result!.manifest.stats.settings).toBe(0);
  });
});
