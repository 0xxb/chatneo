import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';

const mockOpen = vi.fn();
const mockReadFile = vi.fn();

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
  message: vi.fn().mockResolvedValue(undefined),
  ask: vi.fn().mockResolvedValue(true),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
const mockExecute = vi.fn().mockResolvedValue({ rowsAffected: 0 });
const mockDbSelect = vi.fn().mockResolvedValue([]);
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
  emit: vi.fn().mockResolvedValue(undefined),
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

describe('parseBackupFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when user cancels file dialog', async () => {
    mockOpen.mockResolvedValueOnce(null);
    const result = await parseBackupFile();
    expect(result).toBeNull();
  });

  it('parses valid backup file', async () => {
    mockOpen.mockResolvedValueOnce('/path/to/backup.zip');

    // Create a valid ZIP in memory
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 1,
      app: 'ChatNeo',
      created_at: '2024-01-01T00:00:00Z',
      categories: ['settings'],
      stats: { settings: 2 },
    }));
    zip.file('data/settings.json', JSON.stringify([{ key: 'theme', value: 'dark' }]));
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    mockReadFile.mockResolvedValueOnce(zipBytes);

    const result = await parseBackupFile();
    expect(result).not.toBeNull();
    expect(result!.manifest.version).toBe(1);
    expect(result!.manifest.app).toBe('ChatNeo');
    expect(result!.manifest.categories).toEqual(['settings']);
  });

  it('throws when no manifest.json in ZIP', async () => {
    mockOpen.mockResolvedValueOnce('/path/to/bad.zip');
    const zip = new JSZip();
    zip.file('other.txt', 'data');
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    mockReadFile.mockResolvedValueOnce(zipBytes);

    await expect(parseBackupFile()).rejects.toThrow('settings.data.invalidBackupNoManifest');
  });

  it('throws for wrong app name', async () => {
    mockOpen.mockResolvedValueOnce('/path/to/wrong.zip');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 1,
      app: 'OtherApp',
      categories: ['settings'],
      stats: {},
    }));
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    mockReadFile.mockResolvedValueOnce(zipBytes);

    await expect(parseBackupFile()).rejects.toThrow('settings.data.invalidBackupWrongApp');
  });

  it('throws for unsupported version', async () => {
    mockOpen.mockResolvedValueOnce('/path/to/v2.zip');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 2,
      app: 'ChatNeo',
      categories: ['settings'],
      stats: {},
    }));
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    mockReadFile.mockResolvedValueOnce(zipBytes);

    await expect(parseBackupFile()).rejects.toThrow('settings.data.invalidBackupVersion');
  });

  it('throws for invalid format (missing categories)', async () => {
    mockOpen.mockResolvedValueOnce('/path/to/bad.zip');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ version: 1, app: 'ChatNeo' }));
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    mockReadFile.mockResolvedValueOnce(zipBytes);

    await expect(parseBackupFile()).rejects.toThrow('settings.data.invalidBackupBadFormat');
  });

  it('computes stats from data files when manifest has no stats', async () => {
    mockOpen.mockResolvedValueOnce('/path/to/nostats.zip');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 1,
      app: 'ChatNeo',
      categories: ['prompts'],
      stats: {},
    }));
    zip.file('data/prompts.json', JSON.stringify([{ id: 'p1' }, { id: 'p2' }]));
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    mockReadFile.mockResolvedValueOnce(zipBytes);

    const result = await parseBackupFile();
    expect(result!.manifest.stats.prompts).toBe(2);
  });
});

describe('restoreBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rowsAffected: 0 });
    mockDbSelect.mockResolvedValue([]);
  });

  async function makePreview(categories: string[], dataFiles: Record<string, unknown[]>) {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 1, app: 'ChatNeo', created_at: '2024-01-01', categories, stats: {},
    }));
    for (const [name, data] of Object.entries(dataFiles)) {
      zip.file(`data/${name}.json`, JSON.stringify(data));
    }
    return {
      manifest: { version: 1, app: 'ChatNeo', created_at: '2024-01-01', categories, stats: {} as Record<string, number> },
      zip,
    };
  }

  it('returns false when user declines confirmation', async () => {
    vi.mocked(ask).mockResolvedValueOnce(false);
    const preview = await makePreview(['settings'], { settings: [] });
    const result = await restoreBackup(preview as any);
    expect(result).toBe(false);
  });

  it('restores settings category', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(['settings'], {
      settings: [{ key: 'theme', value: 'dark' }, { key: 'font_size', value: 'large' }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith('BEGIN IMMEDIATE');
    expect(mockExecute).toHaveBeenCalledWith('COMMIT');
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM settings');
  });

  it('restores providers category', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(['providers'], {
      providers: [{ id: 1, type: 'openai', icon: '', name: 'OpenAI', config: '{}', sort_order: 0 }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM providers');
  });

  it('restores prompts category', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(['prompts'], {
      prompts: [{ id: 'p1', title: '翻译', content: '请翻译', variables: '[]', category: '', sort_order: 0, created_at: 1000, updated_at: 1000 }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM prompts');
  });

  it('restores conversations with messages and attachments', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(['conversations'], {
      conversations: [{
        id: 'c1', title: '对话', provider_id: 1, model_id: 'gpt-4', pinned: 0, archived: 0, summary: '', created_at: 1000, updated_at: 1000,
        messages: [{
          id: 'm1', conversation_id: 'c1', role: 'user', content: '你好', thinking: '', parts: '', token_count: null, rag_results: '', search_results: '', created_at: 1000,
          attachments: [{ id: 'a1', message_id: 'm1', type: 'image', name: 'pic.png', path: 'pic.png', sort_order: 0, created_at: 1000 }],
        }],
      }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM conversations');
  });

  it('restores knowledge_bases with documents and chunks', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    const preview = await makePreview(['knowledge_bases'], {
      knowledge_bases: [{
        id: 'kb1', name: '知识库', description: '', embedding_provider_id: 1, embedding_model: 'e5', dimensions: 768, chunk_size: 1000, chunk_overlap: 200, created_at: 1000, updated_at: 1000,
        documents: [{
          id: 'd1', knowledge_base_id: 'kb1', name: 'doc.pdf', type: 'pdf', source: '', status: 'completed', error: null, chunk_count: 1, created_at: 1000,
          chunks: [{ document_id: 'd1', content: 'text content', position: 0, token_count: 10 }],
        }],
      }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM knowledge_bases');
  });

  it('rolls back on error', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true);
    mockExecute.mockImplementation((sql: string) => {
      if (sql.startsWith('INSERT INTO settings')) throw new Error('insert failed');
      return Promise.resolve({ rowsAffected: 0 });
    });

    const preview = await makePreview(['settings'], {
      settings: [{ key: 'bad', value: 'data' }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(false);
    expect(mockExecute).toHaveBeenCalledWith('ROLLBACK');
  });

  it('warns about MCP servers with stdio commands', async () => {
    vi.mocked(ask)
      .mockResolvedValueOnce(true)  // main confirmation
      .mockResolvedValueOnce(true); // MCP warning
    const preview = await makePreview(['mcp_servers'], {
      mcp_servers: [{ id: 's1', name: 'test', transport: 'stdio', enabled: 1, command: '/usr/bin/node', args: '["server.js"]', env: '{}', url: '', headers: '', created_at: 1000, updated_at: 1000 }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(true);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('aborts when user declines MCP warning', async () => {
    vi.mocked(ask)
      .mockResolvedValueOnce(true)   // main confirmation
      .mockResolvedValueOnce(false); // MCP warning declined
    const preview = await makePreview(['mcp_servers'], {
      mcp_servers: [{ id: 's1', name: 'test', transport: 'stdio', enabled: 1, command: 'malicious', args: '', env: '', url: '', headers: '', created_at: 1000, updated_at: 1000 }],
    });

    const result = await restoreBackup(preview as any);
    expect(result).toBe(false);
  });
});
