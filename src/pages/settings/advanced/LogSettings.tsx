import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingGroup, SettingRow } from '../../../components/Settings/SettingGroup';
import { NativeSelect, NativeSwitch } from '../../../components/ui/native';
import { useSettings } from '../../../hooks/useSettings';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen } from 'lucide-react';

export default function LogSettings() {
  const { t } = useTranslation();
  const { settings, loading, setSetting } = useSettings();
  const [logDir, setLogDir] = useState('');

  useEffect(() => {
    invoke<string>('get_log_dir').then(setLogDir);
  }, []);

  if (loading) return null;

  return (
    <div className="max-w-2xl mx-auto p-5 space-y-4">
      <SettingGroup title={t('settings.log.title')}>
        <SettingRow label={t('settings.log.enable')} desc={t('settings.log.enableDesc')}>
          <NativeSwitch
            checked={(settings.log_enabled ?? '1') === '1'}
            onChange={(e) => setSetting('log_enabled', e.target.checked ? '1' : '0')}
          />
        </SettingRow>
        <SettingRow label={t('settings.log.retentionDays')} desc={t('settings.log.retentionDaysDesc')}>
          <NativeSelect
            value={settings.log_retention_days ?? '7'}
            onChange={(e) => setSetting('log_retention_days', e.target.value)}
          >
            <option value="3">{t('settings.log.days3')}</option>
            <option value="7">{t('settings.log.days7')}</option>
            <option value="14">{t('settings.log.days14')}</option>
            <option value="30">{t('settings.log.days30')}</option>
          </NativeSelect>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.log.storage')}>
        <SettingRow label={t('settings.log.logDir')} desc={logDir || t('settings.log.loading')}>
          <button
            onClick={() => invoke('open_log_dir')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-(--color-accent) hover:bg-(--color-fill-secondary) transition-colors cursor-default"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {t('settings.log.openDir')}
          </button>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
