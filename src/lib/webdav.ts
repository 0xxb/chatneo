import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import JSZip from 'jszip';
import { createBackupBlob, ALL_CATEGORIES, type BackupManifest, restoreBackup } from './backup';
import * as settingsDao from './dao/settings-dao';
import { logger } from './logger';

export interface WebDavConfig {
  url: string;
  username: string;
  password: string;
  backupPath: string;
}

export interface CloudBackupEntry {
  name: string;
  size: number;
  modified: string;
}

// ─── Base64 helpers ──────────────────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(''));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Config helper ──────────────────────────────────────────────────────────

async function getWebDavConfig(): Promise<WebDavConfig> {
  const map = await settingsDao.getSettings([
    'webdav_url', 'webdav_username', 'webdav_password', 'webdav_backup_path',
  ]);
  return {
    url: map['webdav_url'] ?? '',
    username: map['webdav_username'] ?? '',
    password: map['webdav_password'] ?? '',
    backupPath: map['webdav_backup_path'] ?? '/chatneo/backups/',
  };
}

function buildRemotePath(backupPath: string, filename: string): string {
  return `${backupPath.replace(/\/$/, '')}/${filename}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function testConnection(config: WebDavConfig): Promise<void> {
  await invoke('webdav_test_connection', {
    url: config.url,
    username: config.username,
    password: config.password,
  });
}

export async function listBackups(config?: WebDavConfig): Promise<CloudBackupEntry[]> {
  const cfg = config ?? (await getWebDavConfig());
  const entries = await invoke<CloudBackupEntry[]>('webdav_propfind', {
    url: cfg.url,
    username: cfg.username,
    password: cfg.password,
    path: cfg.backupPath,
  });
  return entries
    .filter((e) => e.name.endsWith('.zip'))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function uploadBackup(config?: WebDavConfig): Promise<void> {
  const cfg = config ?? (await getWebDavConfig());

  const setSetting = async (key: string, value: string) => {
    await settingsDao.setSetting(key, value);
    emit('settings-changed', { key, value });
  };

  try {
    logger.info('webdav', '开始上传备份');
    const zipBytes = await createBackupBlob(ALL_CATEGORIES);
    const base64 = uint8ArrayToBase64(zipBytes);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `chatneo-backup-${timestamp}.zip`;
    const remotePath = buildRemotePath(cfg.backupPath, filename);

    await invoke('webdav_put', {
      url: cfg.url,
      username: cfg.username,
      password: cfg.password,
      path: remotePath,
      data: base64,
    });

    logger.info('webdav', `备份上传成功: ${filename}`);
    await setSetting('webdav_last_backup_time', String(Date.now()));
    await setSetting('webdav_last_backup_status', 'success');
    await setSetting('webdav_last_backup_error', '');

    // Read max_backups setting and clean old backups
    const maxBackupsValue = await settingsDao.getSetting('webdav_max_backups');
    const maxBackups = parseInt(maxBackupsValue ?? '10', 10);
    await cleanOldBackups(cfg, maxBackups);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.error('webdav', `备份上传失败: ${errMsg}`);
    await setSetting('webdav_last_backup_status', 'failed').catch((err) => { logger.warn('webdav', `设置备份状态失败: ${err}`); });
    await setSetting('webdav_last_backup_error', errMsg).catch((err) => { logger.warn('webdav', `设置备份错误信息失败: ${err}`); });
    throw e;
  }
}

export async function downloadAndRestore(filename: string, config?: WebDavConfig): Promise<boolean> {
  const cfg = config ?? (await getWebDavConfig());
  const remotePath = buildRemotePath(cfg.backupPath, filename);

  logger.info('webdav', `开始下载并恢复备份: ${filename}`);
  const base64 = await invoke<string>('webdav_get', {
    url: cfg.url,
    username: cfg.username,
    password: cfg.password,
    path: remotePath,
  });

  const bytes = base64ToUint8Array(base64);
  const zip = await JSZip.loadAsync(bytes);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('备份文件无效：缺少 manifest.json');

  const manifest: BackupManifest = JSON.parse(await manifestFile.async('text'));
  return restoreBackup({ manifest, zip });
}

export async function deleteBackup(filename: string, config?: WebDavConfig): Promise<void> {
  const cfg = config ?? (await getWebDavConfig());
  const remotePath = buildRemotePath(cfg.backupPath, filename);

  await invoke('webdav_delete', {
    url: cfg.url,
    username: cfg.username,
    password: cfg.password,
    path: remotePath,
  });

  logger.info('webdav', `已删除备份: ${filename}`);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function cleanOldBackups(config: WebDavConfig, maxCount: number): Promise<void> {
  try {
    const backups = await listBackups(config);
    if (backups.length <= maxCount) return;

    const toDelete = backups.slice(maxCount);
    for (const entry of toDelete) {
      await deleteBackup(entry.name, config);
      logger.info('webdav', `已清理旧备份: ${entry.name}`);
    }
  } catch (e) {
    logger.warn('webdav', `清理旧备份失败: ${e}`);
  }
}
