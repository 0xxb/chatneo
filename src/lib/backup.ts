import JSZip from 'jszip';
import { save, message, ask } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, readDir } from '@tauri-apps/plugin-fs';
import { exists } from '@tauri-apps/plugin-fs';
import { getDb } from './db';
import { logger } from './logger';
import { ensureAttachmentsDir } from './attachments';
import i18n from '../locales';

// Re-export restore functions for backward compatibility
export { parseBackupFile, restoreBackup } from './restore';

export type BackupCategory =
  | 'conversations'
  | 'settings'
  | 'providers'
  | 'prompts'
  | 'plugins'
  | 'mcp_servers'
  | 'model_favorites'
  | 'knowledge_bases';

const CATEGORY_I18N_KEYS: Record<BackupCategory, string> = {
  conversations: 'settings.data.categoryConversations',
  settings: 'settings.data.categorySettings',
  providers: 'settings.data.categoryProviders',
  prompts: 'settings.data.categoryPrompts',
  plugins: 'settings.data.categoryPlugins',
  mcp_servers: 'settings.data.categoryMcpServers',
  model_favorites: 'settings.data.categoryModelFavorites',
  knowledge_bases: 'settings.data.categoryKnowledgeBases',
};

export function getCategoryLabel(cat: BackupCategory): string {
  return i18n.t(CATEGORY_I18N_KEYS[cat]);
}

export const ALL_CATEGORIES: BackupCategory[] = [
  'conversations',
  'settings',
  'providers',
  'prompts',
  'plugins',
  'mcp_servers',
  'model_favorites',
  'knowledge_bases',
];

export interface BackupManifest {
  version: number;
  app: string;
  created_at: string;
  categories: BackupCategory[];
  stats: Record<string, number>;
}

export interface RestorePreview {
  manifest: BackupManifest;
  zip: JSZip;
}

export function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

const MEDIA_TYPES = new Set(['text', 'image', 'video', 'audio']);

/** Rewrite media part paths in a parts JSON string. */
export function rewriteMediaPaths(partsJson: string, rewrite: (path: string) => string): string {
  if (!partsJson) return partsJson;
  try {
    const parts = JSON.parse(partsJson);
    if (!Array.isArray(parts) || parts.length === 0 || !MEDIA_TYPES.has(parts[0].type)) return partsJson;
    let changed = false;
    for (const p of parts) {
      if (p.path && typeof p.path === 'string') {
        const newPath = rewrite(p.path);
        if (newPath !== p.path) { p.path = newPath; changed = true; }
      }
    }
    return changed ? JSON.stringify(parts) : partsJson;
  } catch { return partsJson; }
}

// ─── Backup (导出) ───────────────────────────────────────────────────────────

async function exportCategoryData(category: BackupCategory): Promise<unknown[]> {
  const db = await getDb();

  switch (category) {
    case 'conversations': {
      const conversations = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM conversations ORDER BY created_at ASC'
      );
      const allMessages = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM messages ORDER BY created_at ASC'
      );
      const allAttachments = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM attachments ORDER BY created_at ASC'
      );

      // Group messages by conversation_id
      const msgsByConv = new Map<string, Record<string, unknown>[]>();
      for (const msg of allMessages) {
        const cid = msg.conversation_id as string;
        let arr = msgsByConv.get(cid);
        if (!arr) { arr = []; msgsByConv.set(cid, arr); }
        arr.push(msg);
      }

      // Group attachments by message_id
      const attsByMsg = new Map<string, Record<string, unknown>[]>();
      for (const att of allAttachments) {
        const mid = att.message_id as string;
        let arr = attsByMsg.get(mid);
        if (!arr) { arr = []; attsByMsg.set(mid, arr); }
        arr.push(att);
      }

      // Stitch together
      for (const conv of conversations) {
        const messages = msgsByConv.get(conv.id as string) ?? [];
        for (const msg of messages) {
          const attachments = attsByMsg.get(msg.id as string) ?? [];
          // Store only filename for portability
          for (const att of attachments) {
            if (typeof att.path === 'string') att.path = basename(att.path);
            if (typeof att.thumbnail_path === 'string' && att.thumbnail_path)
              att.thumbnail_path = basename(att.thumbnail_path);
          }
          // Strip media part paths to filename for portability
          if (typeof msg.parts === 'string' && msg.parts) {
            msg.parts = rewriteMediaPaths(msg.parts as string, basename);
          }
          (msg as Record<string, unknown>).attachments = attachments;
        }
        (conv as Record<string, unknown>).messages = messages;
      }
      return conversations;
    }

    case 'settings': {
      const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM settings');
      // Normalize custom bg image path to filename for portability
      const bgRow = rows.find((r) => r.key === 'chat_bg_image');
      if (bgRow && typeof bgRow.value === 'string' && bgRow.value && !bgRow.value.startsWith('preset:')) {
        bgRow.value = basename(bgRow.value) || bgRow.value;
      }
      return rows;
    }

    case 'providers':
      return db.select('SELECT * FROM providers ORDER BY sort_order ASC');

    case 'prompts':
      return db.select('SELECT * FROM prompts ORDER BY sort_order ASC');

    case 'plugins':
      return db.select('SELECT * FROM plugins');

    case 'mcp_servers':
      return db.select('SELECT * FROM mcp_servers ORDER BY created_at ASC');

    case 'model_favorites':
      return db.select('SELECT * FROM model_favorites ORDER BY created_at ASC');

    case 'knowledge_bases': {
      const kbs = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM knowledge_bases ORDER BY created_at ASC',
      );
      const allDocs = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM knowledge_documents ORDER BY created_at ASC',
      );
      const allChunks = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM knowledge_chunks ORDER BY document_id, position ASC',
      );
      const docsByKb = new Map<string, Record<string, unknown>[]>();
      for (const doc of allDocs) {
        const kbId = doc.knowledge_base_id as string;
        let arr = docsByKb.get(kbId);
        if (!arr) { arr = []; docsByKb.set(kbId, arr); }
        arr.push(doc);
      }
      const chunksByDoc = new Map<string, Record<string, unknown>[]>();
      for (const chunk of allChunks) {
        const docId = chunk.document_id as string;
        let arr = chunksByDoc.get(docId);
        if (!arr) { arr = []; chunksByDoc.set(docId, arr); }
        arr.push(chunk);
      }
      for (const kb of kbs) {
        const docs = docsByKb.get(kb.id as string) ?? [];
        for (const doc of docs) {
          (doc as Record<string, unknown>).chunks = chunksByDoc.get(doc.id as string) ?? [];
        }
        (kb as Record<string, unknown>).documents = docs;
      }
      return kbs;
    }
  }
}

async function collectAttachmentFiles(zip: JSZip): Promise<void> {
  const dir = await ensureAttachmentsDir();
  if (!(await exists(dir))) return;

  const entries = await readDir(dir);
  const attFolder = zip.folder('attachments')!;

  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile) continue;
    try {
      const bytes = await readFile(`${dir}/${entry.name}`);
      attFolder.file(entry.name, bytes);
      count++;
    } catch (e) {
      logger.warn('backup', `跳过附件文件 ${entry.name}: ${e}`);
    }
  }
  logger.info('backup', `已收集 ${count} 个附件文件`);
}

const SENSITIVE_CATEGORIES: BackupCategory[] = ['providers', 'settings', 'mcp_servers'];

/**
 * Generate a backup ZIP blob (Uint8Array) for the given categories.
 * Used by both local backup and WebDAV cloud backup.
 */
export async function createBackupBlob(categories: BackupCategory[]): Promise<Uint8Array> {
  logger.info('backup', `开始生成备份，分类: ${categories.join(', ')}`);

  const zip = new JSZip();
  const dataFolder = zip.folder('data')!;
  const stats: Record<string, number> = {};

  for (const cat of categories) {
    try {
      const data = await exportCategoryData(cat);
      dataFolder.file(`${cat}.json`, JSON.stringify(data, null, 2));
      stats[cat] = data.length;
      if (cat === 'conversations') {
        const convs = data as { messages: { attachments?: unknown[] }[] }[];
        stats.messages = convs.reduce((n, c) => n + c.messages.length, 0);
        stats.attachments = convs.reduce(
          (n, c) => n + c.messages.reduce((m, msg) => m + (msg.attachments?.length ?? 0), 0),
          0,
        );
      }
      logger.info('backup', `已导出 ${cat}: ${stats[cat]} 条记录`);
    } catch (e) {
      logger.error('backup', `导出 ${cat} 失败: ${e}`);
      throw new Error(i18n.t('settings.data.exportFailed', { label: getCategoryLabel(cat), error: e }));
    }
  }

  if (categories.includes('conversations')) {
    await collectAttachmentFiles(zip);
  }

  // If backing up settings without conversations, still include custom bg image file
  if (categories.includes('settings') && !categories.includes('conversations')) {
    const settingsData = JSON.parse(await dataFolder.file('settings.json')!.async('text')) as Record<string, unknown>[];
    const bgRow = settingsData.find((r) => r.key === 'chat_bg_image');
    const bgFilename = typeof bgRow?.value === 'string' ? bgRow.value : '';
    if (bgFilename && !bgFilename.startsWith('preset:')) {
      try {
        const dir = await ensureAttachmentsDir();
        const fullPath = `${dir}/${bgFilename}`;
        const bytes = await readFile(fullPath);
        zip.folder('attachments')!.file(bgFilename, bytes);
      } catch (e) {
        logger.warn('backup', `备份背景图失败: ${e}`);
      }
    }
  }

  const manifest: BackupManifest = {
    version: 1,
    app: 'ChatNeo',
    created_at: new Date().toISOString(),
    categories,
    stats,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function createBackup(categories: BackupCategory[]): Promise<void> {
  const hasSensitive = categories.some((c) => SENSITIVE_CATEGORIES.includes(c));
  if (hasSensitive) {
    const confirmed = await ask(
      i18n.t('settings.data.sensitiveWarning'),
      { title: i18n.t('settings.data.sensitiveWarningTitle'), kind: 'warning' },
    );
    if (!confirmed) return;
  }

  const now = new Date();
  const savePath = await save({
    defaultPath: `chatneo-backup-${now.toISOString().slice(0, 10)}.zip`,
    filters: [{ name: i18n.t('settings.data.backupFilter'), extensions: ['zip'] }],
  });
  if (!savePath) return;

  const zipBytes = await createBackupBlob(categories);
  await writeFile(savePath, zipBytes);

  logger.info('backup', `备份已写入: ${savePath}`);
  await message(i18n.t('settings.data.backupCompletePrompt', { path: savePath }), { title: i18n.t('settings.data.backupCompleteTitle'), kind: 'info' });
}
