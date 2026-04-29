import { getSettings } from './dao/settings-dao';
import { uploadBackup } from './webdav';
import { logger } from './logger';
import { isChatWindow } from './utils';
import { emit, listen } from '@tauri-apps/api/event';

let timerId: ReturnType<typeof setTimeout> | null = null;

const RESTART_EVENT = 'webdav-scheduler:restart';

async function getSchedulerSettings(): Promise<{
  enabled: boolean;
  interval: number;
  lastBackupTime: number;
}> {
  const map = await getSettings([
    'webdav_enabled', 'webdav_backup_interval', 'webdav_last_backup_time',
  ]);
  return {
    enabled: map.webdav_enabled === '1',
    interval: parseInt(map.webdav_backup_interval ?? '86400000', 10),
    lastBackupTime: parseInt(map.webdav_last_backup_time ?? '0', 10),
  };
}

async function runBackup(): Promise<void> {
  try {
    await uploadBackup();
    logger.info('webdav-scheduler', '定时备份完成');
  } catch (e) {
    logger.error('webdav-scheduler', `定时备份失败: ${e}`);
  }
}

function scheduleNext(interval: number): void {
  stopScheduler();
  timerId = setTimeout(async () => {
    await runBackup();
    scheduleNext(interval);
  }, interval);
}

async function runLocalInit(): Promise<void> {
  const { enabled, interval, lastBackupTime } = await getSchedulerSettings();
  if (!enabled) {
    logger.info('webdav-scheduler', 'WebDAV 定时备份未启用');
    return;
  }
  const now = Date.now();
  const elapsed = now - lastBackupTime;
  const remaining = Math.max(0, interval - elapsed);
  logger.info('webdav-scheduler', `定时备份已启用，间隔 ${interval}ms，${remaining}ms 后执行下次备份`);
  stopScheduler();
  timerId = setTimeout(async () => {
    await runBackup();
    scheduleNext(interval);
  }, remaining);
}

export async function initScheduler(): Promise<void> {
  if (!isChatWindow()) return;
  await runLocalInit();
  const restart = () =>
    runLocalInit().catch((e) => logger.warn('webdav-scheduler', `定时备份重启失败: ${e}`));
  listen(RESTART_EVENT, restart);
}

export function stopScheduler(): void {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

/** 重启定时备份。非主窗口通过事件转发给主窗口执行（本地没有 timer）。 */
export async function restartScheduler(): Promise<void> {
  if (isChatWindow()) {
    stopScheduler();
    await runLocalInit();
  } else {
    await emit(RESTART_EVENT);
  }
}
