import JSZip from 'jszip';
import { open, message, ask } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { getDb } from './db';
import { logger } from './logger';
import { ensureAttachmentsDir } from './attachments';
import { emit } from '@tauri-apps/api/event';
import i18n from '../locales';
import { getCategoryLabel, type BackupCategory, type BackupManifest, type RestorePreview, basename, rewriteMediaPaths } from './backup';

export async function parseBackupFile(): Promise<RestorePreview | null> {
  const filePath = await open({
    filters: [{ name: i18n.t('settings.data.backupFilter'), extensions: ['zip'] }],
    multiple: false,
  });
  if (!filePath) return null;

  const bytes = await readFile(filePath as string);
  const zip = await JSZip.loadAsync(bytes);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error(i18n.t('settings.data.invalidBackupNoManifest'));

  const manifest: BackupManifest = JSON.parse(await manifestFile.async('text'));

  if (!manifest.version || !Array.isArray(manifest.categories)) {
    throw new Error(i18n.t('settings.data.invalidBackupBadFormat'));
  }
  if (manifest.app !== 'ChatNeo') throw new Error(i18n.t('settings.data.invalidBackupWrongApp'));
  if (manifest.version !== 1) throw new Error(i18n.t('settings.data.invalidBackupVersion'));

  // Use embedded stats, fall back to counting from data files
  if (!manifest.stats || Object.keys(manifest.stats).length === 0) {
    const stats: Record<string, number> = {};
    for (const cat of manifest.categories) {
      const f = zip.file(`data/${cat}.json`);
      if (f) {
        try {
          const arr = JSON.parse(await f.async('text'));
          stats[cat] = Array.isArray(arr) ? arr.length : 0;
        } catch {
          stats[cat] = 0;
        }
      }
    }
    manifest.stats = stats;
  }

  return { manifest, zip };
}

async function restoreAttachments(zip: JSZip): Promise<void> {
  const dir = await ensureAttachmentsDir();

  const files = Object.keys(zip.files).filter((p) => p.startsWith('attachments/') && !p.endsWith('/'));
  for (const filePath of files) {
    try {
      const fileName = basename(filePath);
      if (!fileName) continue;
      const bytes = await zip.file(filePath)!.async('uint8array');
      await writeFile(`${dir}/${fileName}`, bytes);
    } catch (e) {
      logger.warn('backup', `跳过恢复附件: ${filePath}, 错误: ${e}`);
    }
  }
}

async function restoreCategory(
  db: Awaited<ReturnType<typeof getDb>>,
  category: BackupCategory,
  data: Record<string, unknown>[]
): Promise<void> {
  switch (category) {
    case 'conversations': {
      await db.execute('DELETE FROM attachments');
      await db.execute('DELETE FROM messages');
      await db.execute('DELETE FROM conversations');

      const attachmentsDir = await ensureAttachmentsDir();

      for (const conv of data) {
        const messages = (conv.messages ?? []) as Record<string, unknown>[];
        const { messages: _, ...convRow } = conv;
        void _;

        await db.execute(
          `INSERT INTO conversations (id, title, provider_id, model_id, pinned, archived, summary, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [convRow.id, convRow.title, convRow.provider_id, convRow.model_id, convRow.pinned, convRow.archived, convRow.summary ?? '', convRow.created_at, convRow.updated_at]
        );

        for (const msg of messages) {
          const attachments = (msg.attachments ?? []) as Record<string, unknown>[];
          const { attachments: _a, ...msgRow } = msg;
          void _a;

          // Rewrite media part paths to new attachments directory
          const restoredParts = typeof msgRow.parts === 'string' && msgRow.parts
            ? rewriteMediaPaths(msgRow.parts as string, (p) => {
                const name = basename(p);
                return name ? `${attachmentsDir}/${name}` : p;
              })
            : (msgRow.parts ?? '');

          await db.execute(
            `INSERT INTO messages (id, conversation_id, role, content, thinking, parts, token_count, rag_results, search_results, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [msgRow.id, msgRow.conversation_id, msgRow.role, msgRow.content, msgRow.thinking ?? '', restoredParts, msgRow.token_count, msgRow.rag_results ?? '', msgRow.search_results ?? '', msgRow.created_at]
          );

          for (const att of attachments) {
            const filename = typeof att.path === 'string' ? att.path : '';
            const fullPath = filename ? `${attachmentsDir}/${filename}` : '';
            const thumbFilename = typeof att.thumbnail_path === 'string' && att.thumbnail_path ? att.thumbnail_path : null;
            const thumbPath = thumbFilename ? `${attachmentsDir}/${thumbFilename}` : null;

            await db.execute(
              `INSERT INTO attachments (id, message_id, type, name, path, thumbnail_path, size, sort_order, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [att.id, att.message_id, att.type, att.name, fullPath, thumbPath, att.size, att.sort_order ?? 0, att.created_at]
            );
          }
        }
      }
      break;
    }

    case 'settings': {
      await db.execute('DELETE FROM settings');
      const attachmentsDir = await ensureAttachmentsDir();
      for (const row of data) {
        let value = row.value;
        // Rewrite custom bg image path (stored as filename) to full path
        if (row.key === 'chat_bg_image' && typeof value === 'string' && value && !value.startsWith('preset:') && !value.includes('/')) {
          value = `${attachmentsDir}/${value}`;
        }
        await db.execute('INSERT INTO settings (key, value) VALUES (?, ?)', [row.key, value]);
      }
      break;
    }

    case 'providers': {
      await db.execute('DELETE FROM providers');
      for (const row of data) {
        await db.execute(
          'INSERT INTO providers (id, type, icon, name, config, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [row.id, row.type, row.icon, row.name, row.config, row.sort_order]
        );
      }
      break;
    }

    case 'prompts': {
      await db.execute('DELETE FROM prompts');
      for (const row of data) {
        await db.execute(
          'INSERT INTO prompts (id, title, content, variables, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [row.id, row.title, row.content, row.variables, row.category ?? '', row.sort_order, row.created_at, row.updated_at]
        );
      }
      break;
    }

    case 'plugins': {
      await db.execute('DELETE FROM plugins');
      for (const row of data) {
        await db.execute('INSERT INTO plugins (id, enabled, config) VALUES (?, ?, ?)', [row.id, row.enabled, row.config]);
      }
      break;
    }

    case 'mcp_servers': {
      await db.execute('DELETE FROM mcp_servers');
      for (const row of data) {
        await db.execute(
          'INSERT INTO mcp_servers (id, name, transport, enabled, command, args, env, url, headers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [row.id, row.name, row.transport, row.enabled, row.command, row.args, row.env, row.url, row.headers, row.created_at, row.updated_at]
        );
      }
      break;
    }

    case 'model_favorites': {
      await db.execute('DELETE FROM model_favorites');
      for (const row of data) {
        await db.execute(
          'INSERT INTO model_favorites (model_id, provider_id, created_at) VALUES (?, ?, ?)',
          [row.model_id, row.provider_id, row.created_at]
        );
      }
      break;
    }

    case 'knowledge_bases': {
      await db.execute('DELETE FROM knowledge_chunks');
      await db.execute('DELETE FROM knowledge_documents');
      await db.execute('DELETE FROM knowledge_bases');
      for (const kb of data) {
        const documents = (kb.documents ?? []) as Record<string, unknown>[];
        await db.execute(
          'INSERT INTO knowledge_bases (id, name, description, embedding_provider_id, embedding_model, dimensions, chunk_size, chunk_overlap, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [kb.id, kb.name, kb.description ?? '', kb.embedding_provider_id ?? kb.embedding_provider_id, kb.embedding_model ?? kb.embedding_model_id ?? '', kb.dimensions ?? 768, kb.chunk_size ?? 1000, kb.chunk_overlap ?? 200, kb.created_at, kb.updated_at],
        );
        for (const doc of documents) {
          const chunks = (doc.chunks ?? []) as Record<string, unknown>[];
          // Documents with chunks but no vectors need reprocessing
          const hasChunks = chunks.length > 0;
          await db.execute(
            'INSERT INTO knowledge_documents (id, knowledge_base_id, name, type, source, status, error, chunk_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [doc.id, doc.knowledge_base_id, doc.name, doc.type, doc.source ?? '', hasChunks ? 'pending' : (doc.status ?? 'pending'), doc.error ?? null, doc.chunk_count ?? 0, doc.created_at],
          );
          for (const chunk of chunks) {
            await db.execute(
              'INSERT INTO knowledge_chunks (document_id, content, position, token_count) VALUES (?, ?, ?, ?)',
              [chunk.document_id, chunk.content, chunk.position, chunk.token_count ?? null],
            );
          }
        }
      }
      break;
    }
  }
}

export async function restoreBackup(preview: RestorePreview): Promise<boolean> {
  const { manifest, zip } = preview;

  const lines = manifest.categories.map((cat) => {
    const label = getCategoryLabel(cat);
    return `• ${label}：${manifest.stats[cat] ?? 0} ${i18n.t('settings.data.records')}`;
  });
  const confirmed = await ask(
    i18n.t('settings.data.confirmRestorePrompt', { lines: lines.join('\n') }),
    { title: i18n.t('settings.data.confirmRestoreTitle'), kind: 'warning' }
  );
  if (!confirmed) return false;

  // Warn about MCP servers that could execute arbitrary commands
  if (manifest.categories.includes('mcp_servers')) {
    const mcpFile = zip.file('data/mcp_servers.json');
    if (mcpFile) {
      const mcpData = JSON.parse(await mcpFile.async('text')) as Record<string, unknown>[];
      const stdioCmds = mcpData
        .filter((s) => s.transport === 'stdio' && s.command)
        .map((s) => `• ${s.name}: ${s.command} ${Array.isArray(s.args) ? s.args.join(' ') : String(s.args ?? '')}`);
      if (stdioCmds.length > 0) {
        const mcpConfirmed = await ask(
          i18n.t('settings.data.mcpRestoreWarning', { commands: stdioCmds.join('\n') }),
          { title: i18n.t('settings.data.mcpRestoreWarningTitle'), kind: 'warning' },
        );
        if (!mcpConfirmed) return false;
      }
    }
  }

  logger.info('backup', `开始恢复，分类: ${manifest.categories.join(', ')}`);
  const db = await getDb();

  try {
    await db.execute('BEGIN IMMEDIATE');
    for (const cat of manifest.categories) {
      const f = zip.file(`data/${cat}.json`);
      if (!f) {
        logger.warn('backup', `备份中缺少 ${cat}.json，跳过`);
        continue;
      }
      const data = JSON.parse(await f.async('text')) as Record<string, unknown>[];
      await restoreCategory(db, cat, data);
      logger.info('backup', `已恢复 ${cat}`);
    }

    // Reset providers AUTOINCREMENT sequence after explicit id inserts
    if (manifest.categories.includes('providers')) {
      await db.execute(
        `UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM providers) WHERE name = 'providers'`
      );
    }

    await db.execute('COMMIT');
  } catch (e) {
    try { await db.execute('ROLLBACK'); } catch { /* ignore */ }
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.error('backup', `恢复失败，已回滚: ${errMsg}`);
    await message(i18n.t('settings.data.restoreFailedMsg', { error: errMsg }), { title: i18n.t('settings.data.restoreTitle'), kind: 'error' });
    return false;
  }

  // Restore attachment files after DB commit — file I/O is not transactional,
  // so failures here may leave orphaned DB references but won't corrupt the DB
  const hasAttachmentsInZip = Object.keys(zip.files).some((p) => p.startsWith('attachments/') && !p.endsWith('/'));
  if (hasAttachmentsInZip) {
    await restoreAttachments(zip);
  }

  logger.info('backup', '恢复完成，刷新运行时状态');

  // Reload runtime caches and stores to match restored DB state
  try {
    const cats = new Set(manifest.categories);

    // 1. Reload settings cache by emitting change events for each restored key
    if (cats.has('settings')) {
      const settingsRows = await db.select<{ key: string; value: string }[]>('SELECT key, value FROM settings');
      for (const row of settingsRows) {
        emit('settings-changed', { key: row.key, value: row.value });
      }
    }

    // 2. Reload chat store
    if (cats.has('conversations')) {
      const { useChatStore } = await import('../store/chat');
      await useChatStore.getState().loadConversations();
      await useChatStore.getState().loadArchivedConversations();
      useChatStore.getState().newChat();
    }

    // 3. Restart WebDAV scheduler (reads settings from DB)
    if (cats.has('settings')) {
      const { restartScheduler } = await import('./webdav-scheduler');
      await restartScheduler();
    }

    // 4. Reconnect MCP servers
    if (cats.has('mcp_servers')) {
      const { mcpManager } = await import('./mcp-manager');
      await mcpManager.disconnectAll();
      await mcpManager.connectAll();
    }
  } catch (e) {
    logger.warn('backup', `恢复后刷新运行时状态部分失败: ${e}`);
  }

  await message(i18n.t('settings.data.restoreSuccessMsg'), { title: i18n.t('settings.data.restoreSuccessTitle'), kind: 'info' });
  return true;
}
