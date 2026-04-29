import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingGroup, SettingRow } from '../../components/Settings/SettingGroup';
import { NativeSelect, NativeInput, NativeSwitch } from '../../components/ui/native';
import { useSettings } from '../../hooks/useSettings';

export default function GeneralSettings() {
  const { settings, loading, setSetting } = useSettings();
  const { t, i18n } = useTranslation();
  const [proxy, setProxy] = useState<string | null>(null);

  if (loading) return null;

  const proxyValue = proxy ?? settings.proxy ?? '';

  return (
    <div className="max-w-2xl mx-auto p-5 space-y-4">
      <SettingGroup title={t('settings.language.title')}>
        <SettingRow label={t('settings.language.title')} desc={t('settings.language.desc')}>
          <NativeSelect
            value={settings.language ?? 'zh'}
            onChange={(e) => {
              setSetting('language', e.target.value)
              i18n.changeLanguage(e.target.value)
            }}
          >
            <option value="zh">简体中文</option>
            <option value="en">English</option>
          </NativeSelect>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.conversation.title')}>
        <SettingRow label={t('settings.conversation.contextCount')} desc={t('settings.conversation.contextCountDesc')}>
          <NativeSelect
            value={settings.context_message_count ?? 'all'}
            onChange={(e) => setSetting('context_message_count', e.target.value)}
          >
            <option value="5">{t('settings.conversation.recent5')}</option>
            <option value="10">{t('settings.conversation.recent10')}</option>
            <option value="20">{t('settings.conversation.recent20')}</option>
            <option value="50">{t('settings.conversation.recent50')}</option>
            <option value="all">{t('settings.conversation.all')}</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.conversation.streaming')} desc={t('settings.conversation.streamingDesc')}>
          <NativeSwitch
            checked={(settings.streaming_enabled ?? '1') === '1'}
            onChange={(e) => setSetting('streaming_enabled', e.target.checked ? '1' : '0')}
          />
        </SettingRow>
        <SettingRow label={t('settings.conversation.markdown')} desc={t('settings.conversation.markdownDesc')}>
          <NativeSwitch
            checked={(settings.markdown_rendering ?? '1') === '1'}
            onChange={(e) => setSetting('markdown_rendering', e.target.checked ? '1' : '0')}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.system.title')}>
        <SettingRow label={t('settings.system.autoStart')} desc={t('settings.system.autoStartDesc')}>
          <NativeSwitch
            checked={settings.launch_at_startup === '1'}
            onChange={(e) => setSetting('launch_at_startup', e.target.checked ? '1' : '0')}
          />
        </SettingRow>
        <SettingRow label={t('settings.system.closeToTray')} desc={t('settings.system.closeToTrayDesc')}>
          <NativeSwitch
            checked={settings.minimize_to_tray === '1'}
            onChange={(e) => setSetting('minimize_to_tray', e.target.checked ? '1' : '0')}
          />
        </SettingRow>
        <SettingRow label={t('settings.system.trayVisibility')} desc={t('settings.system.trayVisibilityDesc')}>
          <NativeSelect
            value={settings.tray_visibility ?? 'when_running'}
            onChange={(e) => setSetting('tray_visibility', e.target.value)}
          >
            <option value="always">{t('settings.system.alwaysShow')}</option>
            <option value="when_running">{t('settings.system.showWhenRunning')}</option>
            <option value="never">{t('settings.system.neverShow')}</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.system.proxy')} desc={t('settings.system.proxyDesc')}>
          <NativeInput
            placeholder={t('settings.system.proxyPlaceholder')}
            className="w-64"
            value={proxyValue}
            onChange={(e) => setProxy(e.target.value)}
            onBlur={() => {
              if (proxy !== null) {
                setSetting('proxy', proxy);
                setProxy(null);
              }
            }}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
