import { useEffect, useMemo } from 'react';
import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SubLayout from '../../components/Settings/SubLayout';
import { getAllPlugins } from '../../lib/plugin-registry';
import { usePlugins } from '../../hooks/usePlugins';
import { useContextMenu } from '../../hooks/useContextMenu';
import { NativeSwitch } from '../../components/ui/native';
import type { SubMenuItem } from '../../components/Settings/SubLayout';

export default function PluginSettings() {
  const { t } = useTranslation();
  const { pluginId } = useParams<{ pluginId: string }>();
  const navigate = useNavigate();
  const definitions = useMemo(() => getAllPlugins(), []);
  const { plugins, setPluginEnabled } = usePlugins();

  const showItemMenu = useContextMenu<string>(
    (ctx) => {
      const state = plugins.find((p) => p.id === ctx);
      const isEnabled = state?.enabled ?? true;
      return [
        { type: 'item', id: 'toggle', text: isEnabled ? t('common.disable') : t('common.enable') },
      ];
    },
    (action, id) => {
      if (action === 'toggle') {
        const state = plugins.find((p) => p.id === id);
        const isEnabled = state?.enabled ?? true;
        setPluginEnabled(id, !isEnabled);
      }
    },
  );

  const items: SubMenuItem[] = definitions.map((p) => ({
    id: p.id,
    path: `/plugin/${p.id}`,
    label: p.name,
    onContextMenu: (e: React.MouseEvent) => showItemMenu(e, p.id),
  }));

  useEffect(() => {
    if (!pluginId && definitions.length > 0) {
      navigate(`/plugin/${definitions[0].id}`, { replace: true });
    }
  }, [pluginId, definitions, navigate]);

  const current = definitions.find((p) => p.id === pluginId);
  const currentState = plugins.find((p) => p.id === pluginId);
  const enabled = currentState?.enabled ?? true;

  return (
    <SubLayout
      items={items}
      title={current?.name ?? t('settings.plugin.selectPlugin')}
      titleExtra={pluginId ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-(--color-label-tertiary)">{enabled ? t('common.enabled') : t('common.disabled')}</span>
          <NativeSwitch
            checked={enabled}
            onChange={(e) => setPluginEnabled(pluginId, e.target.checked)}
          />
        </div>
      ) : undefined}
    >
      <Outlet />
    </SubLayout>
  );
}
