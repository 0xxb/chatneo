import { useEffect, useMemo } from 'react';
import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SubLayout from '../../components/Settings/SubLayout';
import { getAllTools } from '../../lib/tool-registry';
import { useTools } from '../../hooks/useTools';
import { useSettings } from '../../hooks/useSettings';
import { useContextMenu } from '../../hooks/useContextMenu';
import { NativeSwitch, NativeSelect } from '../../components/ui/native';
import type { SubMenuItem } from '../../components/Settings/SubLayout';

export default function ToolSettings() {
  const { t } = useTranslation();
  const { toolId } = useParams<{ toolId: string }>();
  const navigate = useNavigate();
  const definitions = useMemo(() => getAllTools(), []);
  const { tools, setToolEnabled } = useTools();
  const { settings, setSetting } = useSettings();
  const toolsEnabled = (settings.tools_enabled ?? '0') === '1';

  const showItemMenu = useContextMenu<string>(
    (ctx) => {
      const state = tools.find((ts) => ts.id === ctx);
      const def = definitions.find((td) => td.id === ctx);
      const isEnabled = state?.enabled ?? def?.enabledByDefault ?? true;
      return [
        { type: 'item', id: 'toggle', text: isEnabled ? t('common.disable') : t('common.enable') },
      ];
    },
    (action, id) => {
      if (action === 'toggle') {
        const state = tools.find((ts) => ts.id === id);
        const def = definitions.find((td) => td.id === id);
        const isEnabled = state?.enabled ?? def?.enabledByDefault ?? true;
        setToolEnabled(id, !isEnabled);
      }
    },
  );

  const items: SubMenuItem[] = definitions.map((td) => ({
    id: td.id,
    path: `/tool/${td.id}`,
    label: td.name,
    onContextMenu: (e: React.MouseEvent) => showItemMenu(e, td.id),
  }));

  useEffect(() => {
    if (!toolId && definitions.length > 0) {
      navigate(`/tool/${definitions[0].id}`, { replace: true });
    }
  }, [toolId, definitions, navigate]);

  const current = definitions.find((td) => td.id === toolId);
  const currentState = tools.find((ts) => ts.id === toolId);
  const enabled = currentState?.enabled ?? current?.enabledByDefault ?? true;

  const headerContent = (
    <div className="p-2.5 space-y-2 border-b border-(--color-separator)">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-(--color-label-secondary)">{t('settings.tool.enable')}</span>
        <NativeSwitch
          checked={toolsEnabled}
          onChange={(e) => setSetting('tools_enabled', e.target.checked ? '1' : '0')}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-(--color-label-secondary)">{t('settings.tool.maxSteps')}</span>
        <NativeSelect
          className="w-16"
          value={settings.tools_max_steps ?? '5'}
          onChange={(e) => setSetting('tools_max_steps', e.target.value)}
        >
          <option value="1">1</option>
          <option value="3">3</option>
          <option value="5">5</option>
          <option value="10">10</option>
        </NativeSelect>
      </div>
    </div>
  );

  return (
    <SubLayout
      items={items}
      header={headerContent}
      title={current?.name ?? t('settings.tool.selectTool')}
      titleExtra={
        toolId ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-(--color-label-tertiary)">
              {enabled ? t('common.enabled') : t('common.disabled')}
            </span>
            <NativeSwitch
              checked={enabled}
              onChange={(e) => setToolEnabled(toolId, e.target.checked)}
            />
          </div>
        ) : undefined
      }
    >
      <Outlet />
    </SubLayout>
  );
}
