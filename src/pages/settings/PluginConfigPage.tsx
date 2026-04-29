import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPlugin } from '../../lib/plugin-registry';
import { usePlugins } from '../../hooks/usePlugins';

export default function PluginConfigPage() {
  const { t } = useTranslation();
  const { pluginId } = useParams<{ pluginId: string }>();
  const { plugins, setPluginConfig } = usePlugins();

  if (!pluginId) return null;

  const definition = getPlugin(pluginId);
  if (!definition) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-(--color-label-tertiary)">
        {t('settings.plugin.notFound')}
      </div>
    );
  }

  const state = plugins.find((p) => p.id === pluginId);
  const config = state?.config ?? definition.defaultConfig();
  const { ConfigForm } = definition;

  return (
    <div className="p-4 space-y-4" key={pluginId}>
      <p className="text-[13px] text-(--color-label-secondary)">{definition.description}</p>
      <ConfigForm
        config={config}
        onSave={(newConfig) => setPluginConfig(pluginId, newConfig)}
      />
    </div>
  );
}
