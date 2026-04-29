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

import { createBackupBlob, createBackup } from '../backup';
import { ask } from '@tauri-apps/plugin-dialog';

describe('createBackupBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue([]);
  });

  it('creates a valid ZIP with manifest for settings', async () => {
    mockSelect.mockResolvedValueOnce([{ key: 'theme', value: 'dark' }]);

    const blob = await createBackupBlob(['settings']);
    expect(blob).toBeInstanceOf(Uint8Array);
    expect(blob.length).toBeGreaterThan(0);

    // Verify ZIP contents
    const zip = await JSZip.loadAsync(blob);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
    expect(manifest.version).toBe(1);
    expect(manifest.app).toBe('ChatNeo');
    expect(manifest.categories).toEqual(['settings']);
    expect(manifest.stats.settings).toBe(1);

    const settingsData = JSON.parse(await zip.file('data/settings.json')!.async('text'));
    expect(settingsData).toHaveLength(1);
    expect(settingsData[0].key).toBe('theme');
  });

  it('creates backup for providers', async () => {
    mockSelect.mockResolvedValueOnce([{ id: 1, name: 'OpenAI', type: 'openai' }]);

    const blob = await createBackupBlob(['providers']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/providers.json')!.async('text'));
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('OpenAI');
  });

  it('creates backup for conversations with messages', async () => {
    // conversations query
    mockSelect.mockResolvedValueOnce([{ id: 'c1', title: '对话' }]);
    // messages query
    mockSelect.mockResolvedValueOnce([{ id: 'm1', conversation_id: 'c1', content: '你好', parts: '' }]);
    // attachments query
    mockSelect.mockResolvedValueOnce([]);

    const blob = await createBackupBlob(['conversations']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/conversations.json')!.async('text'));
    expect(data).toHaveLength(1);
    expect(data[0].messages).toHaveLength(1);
  });

  it('creates backup for prompts', async () => {
    mockSelect.mockResolvedValueOnce([{ id: 'p1', title: '翻译', content: '请翻译' }]);
    const blob = await createBackupBlob(['prompts']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/prompts.json')!.async('text'));
    expect(data[0].title).toBe('翻译');
  });

  it('creates backup for knowledge_bases with nested docs', async () => {
    // knowledge_bases
    mockSelect.mockResolvedValueOnce([{ id: 'kb1', name: '知识库' }]);
    // documents
    mockSelect.mockResolvedValueOnce([{ id: 'd1', knowledge_base_id: 'kb1', name: 'doc.pdf' }]);
    // chunks
    mockSelect.mockResolvedValueOnce([{ id: 'ch1', document_id: 'd1', content: 'text' }]);

    const blob = await createBackupBlob(['knowledge_bases']);
    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file('data/knowledge_bases.json')!.async('text'));
    expect(data[0].documents).toHaveLength(1);
    expect(data[0].documents[0].chunks).toHaveLength(1);
  });
});

describe('createBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue([]);
  });

  it('prompts for sensitive data warning', async () => {
    await createBackup(['providers']);
    expect(ask).toHaveBeenCalled();
  });

  it('does not prompt for non-sensitive categories', async () => {
    await createBackup(['prompts']);
    expect(ask).not.toHaveBeenCalled();
  });

  it('aborts if user declines sensitive warning', async () => {
    vi.mocked(ask).mockResolvedValueOnce(false);
    await createBackup(['providers']);
    // save dialog should not be called
    const { save } = await import('@tauri-apps/plugin-dialog');
    expect(save).not.toHaveBeenCalled();
  });
});
