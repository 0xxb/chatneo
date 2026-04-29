import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { SettingGroup, SettingRow } from '../../../components/Settings/SettingGroup';
import { NativeCheckbox } from '../../../components/ui/NativeCheckbox';
import { NativeInput } from '../../../components/ui/NativeInput';
import { NativeSwitch } from '../../../components/ui/NativeSwitch';
import { NativeSelect } from '../../../components/ui/NativeSelect';
import {
  ALL_CATEGORIES,
  getCategoryLabel,
  createBackup,
  parseBackupFile,
  restoreBackup,
  type BackupCategory,
  type RestorePreview,
} from '../../../lib/backup';
import { useSettings } from '../../../hooks/useSettings';
import {
  testConnection as webdavTestConnection,
  listBackups as webdavListBackups,
  uploadBackup as webdavUploadBackup,
  downloadAndRestore as webdavDownloadAndRestore,
  deleteBackup as webdavDeleteBackup,
  type CloudBackupEntry,
  type WebDavConfig,
} from '../../../lib/webdav';
import { restartScheduler } from '../../../lib/webdav-scheduler';

export default function DataSettings() {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<Set<BackupCategory>>(new Set(ALL_CATEGORIES));
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [preview, setPreview] = useState<RestorePreview | null>(null);

  const { settings, setSetting } = useSettings();

  // Cloud backup state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);
  const [cloudBacking, setCloudBacking] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);

  const allSelected = selected.size === ALL_CATEGORIES.length;

  const webdavEnabled = settings.webdav_enabled === '1';
  const webdavUrl = settings.webdav_url ?? '';
  const webdavUsername = settings.webdav_username ?? '';
  const webdavPassword = settings.webdav_password ?? '';
  const webdavBackupPath = settings.webdav_backup_path || '/chatneo/backups/';
  const webdavInterval = settings.webdav_backup_interval ?? '86400000';
  const webdavMaxBackups = settings.webdav_max_backups ?? '10';
  const lastBackupTime = settings.webdav_last_backup_time ?? '0';
  const lastBackupStatus = settings.webdav_last_backup_status ?? '';

  function getWebDavConfig(): WebDavConfig {
    return { url: webdavUrl, username: webdavUsername, password: webdavPassword, backupPath: webdavBackupPath };
  }

  const initialLoaded = useRef(false);
  useEffect(() => {
    if (webdavUrl && !initialLoaded.current) {
      initialLoaded.current = true;
      loadCloudBackups();
    }
  }, [webdavUrl]);

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      await webdavTestConnection(getWebDavConfig());
      setTestResult('success');
    } catch {
      setTestResult('failed');
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleCloudBackup() {
    setCloudBacking(true);
    try {
      await webdavUploadBackup(getWebDavConfig());
      await loadCloudBackups();
    } catch (e) {
      await message(String(e), { title: t('settings.data.cloudBackupFailed'), kind: 'error' });
    } finally {
      setCloudBacking(false);
    }
  }

  async function loadCloudBackups() {
    setLoadingBackups(true);
    try {
      const backups = await webdavListBackups(getWebDavConfig());
      setCloudBackups(backups);
    } catch {
      setCloudBackups([]);
    } finally {
      setLoadingBackups(false);
    }
  }

  async function handleCloudRestore(filename: string) {
    setRestoringFile(filename);
    try {
      await webdavDownloadAndRestore(filename, getWebDavConfig());
    } catch (e) {
      await message(String(e), { title: t('settings.data.cloudRestoreFailed'), kind: 'error' });
    } finally {
      setRestoringFile(null);
    }
  }

  async function handleDeleteCloudBackup(filename: string) {
    const confirmed = await ask(t('settings.data.confirmDeleteCloud'), {
      title: t('settings.data.confirmDeleteCloudTitle'),
      kind: 'warning',
    });
    if (!confirmed) return;
    try {
      await webdavDeleteBackup(filename, getWebDavConfig());
      setCloudBackups((prev) => prev.filter((b) => b.name !== filename));
    } catch (e) {
      await message(String(e), { kind: 'error' });
    }
  }

  async function handleToggleEnabled(enabled: boolean) {
    await setSetting('webdav_enabled', enabled ? '1' : '0');
    await restartScheduler();
  }

  async function handleIntervalChange(value: string) {
    await setSetting('webdav_backup_interval', value);
    await restartScheduler();
  }

  const INTERVAL_OPTIONS = [
    { value: '3600000', label: t('settings.data.interval1h') },
    { value: '21600000', label: t('settings.data.interval6h') },
    { value: '43200000', label: t('settings.data.interval12h') },
    { value: '86400000', label: t('settings.data.interval1d') },
    { value: '604800000', label: t('settings.data.interval1w') },
  ];

  function formatLastBackup(): string {
    if (!lastBackupTime || lastBackupTime === '0') return t('settings.data.lastBackupNone');
    const date = new Date(parseInt(lastBackupTime, 10));
    const dateStr = date.toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en');
    const status = lastBackupStatus === 'failed' ? ` (${t('settings.data.lastBackupFailed')})` : '';
    return dateStr + status;
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ALL_CATEGORIES));
  }

  function toggleCategory(cat: BackupCategory) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  async function handleCreateBackup() {
    setBacking(true);
    try {
      await createBackup(Array.from(selected));
    } catch (e) {
      await message(String(e), { title: t('settings.data.backupFailed'), kind: 'error' });
    } finally {
      setBacking(false);
    }
  }

  async function handleSelectFile() {
    setRestoring(true);
    try {
      const result = await parseBackupFile();
      if (result) setPreview(result);
    } catch (e) {
      await message(String(e), { title: t('settings.data.readFailed'), kind: 'error' });
    } finally {
      setRestoring(false);
    }
  }

  async function handleRestore() {
    if (!preview) return;
    setRestoring(true);
    try {
      const ok = await restoreBackup(preview);
      if (ok) setPreview(null);
    } catch (e) {
      await message(String(e), { title: t('settings.data.restoreFailed'), kind: 'error' });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-5 space-y-4">
      <SettingGroup title={t('settings.data.title')}>
        <SettingRow label={t('settings.data.category')} desc={t('settings.data.categoryDesc')}>
          <div className="flex flex-col gap-1.5">
            <NativeCheckbox
              label={t('settings.data.selectAll')}
              checked={allSelected}
              onChange={toggleAll}
              className="font-medium"
            />
            {ALL_CATEGORIES.map((cat) => (
              <NativeCheckbox
                key={cat}
                label={getCategoryLabel(cat)}
                checked={selected.has(cat)}
                onChange={() => toggleCategory(cat)}
              />
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t('settings.data.createBackup')} desc={t('settings.data.createBackupDesc')}>
          <button
            onClick={handleCreateBackup}
            disabled={backing || selected.size === 0}
            className="px-2.5 py-1 rounded-md text-[12px] text-(--color-accent) hover:bg-(--color-fill-secondary) transition-colors cursor-default disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {backing ? t('settings.data.backingUp') : t('settings.data.createBackup')}
          </button>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.data.restore')}>
        <SettingRow label={t('settings.data.restoreFrom')} desc={!preview ? t('settings.data.restoreDesc') : undefined}>
          {!preview ? (
            <button
              onClick={handleSelectFile}
              disabled={restoring}
              className="px-2.5 py-1 rounded-md text-[12px] text-(--color-accent) hover:bg-(--color-fill-secondary) transition-colors cursor-default disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {restoring ? t('settings.data.reading') : t('settings.data.selectFile')}
            </button>
          ) : (
            <button
              onClick={() => setPreview(null)}
              disabled={restoring}
              className="px-2.5 py-1 rounded-md text-[12px] text-(--color-label-secondary) hover:bg-(--color-fill-secondary) transition-colors cursor-default disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('settings.data.reselect')}
            </button>
          )}
        </SettingRow>
        {preview && (
          <>
            <div className="mx-3 border-t border-(--color-separator)" />
            <div className="px-3 py-2 space-y-1">
              <p className="text-[12px] text-(--color-label-secondary)">
                {t('settings.data.backupTime')}{new Date(preview.manifest.created_at).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en')}
              </p>
              <p className="text-[12px] text-(--color-label-secondary)">
                {t('settings.data.categories')}{preview.manifest.categories.map((c) => getCategoryLabel(c)).join('、')}
              </p>
              <p className="text-[12px] text-(--color-label-secondary)">
                {t('settings.data.dataCount')}{preview.manifest.categories
                  .map((c) => `${getCategoryLabel(c)} ${preview.manifest.stats[c] ?? 0} ${t('settings.data.records')}`)
                  .join('，')}
              </p>
            </div>
            <div className="mx-3 border-t border-(--color-separator)" />
            <div className="px-3 py-2 flex items-center gap-2">
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="px-2.5 py-1 rounded-md text-[12px] text-red-500 hover:bg-red-500/10 transition-colors cursor-default disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {restoring ? t('settings.data.restoring') : t('settings.data.confirmRestore')}
              </button>
              <button
                onClick={() => setPreview(null)}
                disabled={restoring}
                className="px-2.5 py-1 rounded-md text-[12px] text-(--color-label) hover:bg-(--color-fill-secondary) transition-colors cursor-default disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.cancel')}
              </button>
            </div>
          </>
        )}
      </SettingGroup>

      <SettingGroup title={t('settings.data.cloud')}>
        <SettingRow label={t('settings.data.webdavUrl')}>
          <NativeInput type="url" value={webdavUrl} onChange={(e) => setSetting('webdav_url', e.target.value)} placeholder={t('settings.data.webdavUrlPlaceholder')} className="w-56" />
        </SettingRow>
        <SettingRow label={t('settings.data.webdavUsername')}>
          <NativeInput type="text" value={webdavUsername} onChange={(e) => setSetting('webdav_username', e.target.value)} className="w-56" />
        </SettingRow>
        <SettingRow label={t('settings.data.webdavPassword')}>
          <NativeInput type="password" value={webdavPassword} onChange={(e) => setSetting('webdav_password', e.target.value)} className="w-56" />
        </SettingRow>
        <SettingRow label={t('settings.data.backupPath')}>
          <NativeInput type="text" value={webdavBackupPath} onChange={(e) => setSetting('webdav_backup_path', e.target.value)} placeholder={t('settings.data.backupPathPlaceholder')} className="w-56" />
        </SettingRow>
        <SettingRow label={t('settings.data.testConnection')}>
          <div className="flex items-center gap-2">
            <button onClick={handleTestConnection} disabled={testingConnection || !webdavUrl} className="px-2.5 py-1 rounded-md text-[12px] text-(--color-accent) hover:bg-(--color-fill-secondary) transition-colors cursor-default disabled:opacity-50 disabled:cursor-not-allowed">
              {testingConnection ? t('settings.data.testing') : t('settings.data.testConnection')}
            </button>
            {testResult === 'success' && <span className="text-[12px] text-green-500">{t('settings.data.testSuccess')}</span>}
            {testResult === 'failed' && <span className="text-[12px] text-red-500">{t('settings.data.testFailed')}</span>}
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.data.autoBackup')}>
        <SettingRow label={t('settings.data.autoBackup')} desc={t('settings.data.autoBackupDesc')}>
          <NativeSwitch
            checked={webdavEnabled}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
          />
        </SettingRow>
        {webdavEnabled && (
          <>
            <SettingRow label={t('settings.data.interval')}>
              <NativeSelect value={webdavInterval} onChange={(e) => handleIntervalChange(e.target.value)}>
                {INTERVAL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </NativeSelect>
            </SettingRow>
            <SettingRow label={t('settings.data.maxBackups')} desc={t('settings.data.maxBackupsDesc')}>
              <NativeSelect value={webdavMaxBackups} onChange={(e) => setSetting('webdav_max_backups', e.target.value)}>
                {[5, 10, 20, 30, 50].map((n) => <option key={n} value={String(n)}>{n}</option>)}
              </NativeSelect>
            </SettingRow>
          </>
        )}
        <SettingRow label={t('settings.data.lastBackup')}>
          <span className="text-[12px] text-(--color-label-secondary)">{formatLastBackup()}</span>
        </SettingRow>
        <SettingRow label={t('settings.data.backupNow')}>
          <button onClick={handleCloudBackup} disabled={cloudBacking || !webdavUrl} className="px-2.5 py-1 rounded-md text-[12px] text-(--color-accent) hover:bg-(--color-fill-secondary) transition-colors cursor-default disabled:opacity-50 disabled:cursor-not-allowed">
            {cloudBacking ? t('settings.data.backingUpCloud') : t('settings.data.backupNow')}
          </button>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.data.cloudBackups')}>
        <SettingRow label={t('settings.data.cloudBackupsDesc')}>
          <button onClick={loadCloudBackups} disabled={loadingBackups || !webdavUrl} className="px-2.5 py-1 rounded-md text-[12px] text-(--color-accent) hover:bg-(--color-fill-secondary) transition-colors cursor-default disabled:opacity-50 disabled:cursor-not-allowed">
            {loadingBackups ? t('settings.data.loadingBackups') : t('settings.data.refreshBackups')}
          </button>
        </SettingRow>
      </SettingGroup>
      {cloudBackups.length > 0 && (
        <div className="bg-settings-group rounded-lg px-3 py-2 space-y-1">
          {cloudBackups.map((backup) => (
            <div key={backup.name} className="flex items-center justify-between py-1.5 border-b border-(--color-separator) last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-(--color-label) truncate">{backup.name}</p>
                <p className="text-[11px] text-(--color-label-tertiary)">
                  {backup.size > 0 ? `${(backup.size / 1024 / 1024).toFixed(1)} MB` : ''}
                  {backup.modified ? ` · ${backup.modified}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <button onClick={() => handleCloudRestore(backup.name)} disabled={restoringFile !== null} className="px-2 py-0.5 rounded text-[11px] text-(--color-accent) hover:bg-(--color-fill-secondary) transition-colors cursor-default disabled:opacity-50">
                  {restoringFile === backup.name ? t('settings.data.restoring') : t('settings.data.restoreFromCloud')}
                </button>
                <button onClick={() => handleDeleteCloudBackup(backup.name)} disabled={restoringFile !== null} className="px-2 py-0.5 rounded text-[11px] text-red-500 hover:bg-red-500/10 transition-colors cursor-default disabled:opacity-50">
                  {t('settings.data.deleteFromCloud')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!loadingBackups && cloudBackups.length === 0 && webdavUrl && (
        <div className="bg-settings-group rounded-lg px-3 py-3">
          <p className="text-[12px] text-(--color-label-tertiary) text-center">{t('settings.data.noBackups')}</p>
        </div>
      )}
    </div>
  );
}
