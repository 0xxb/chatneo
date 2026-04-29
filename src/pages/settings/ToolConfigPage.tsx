import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getTool } from '../../lib/tool-registry';
import { useTools } from '../../hooks/useTools';

export default function ToolConfigPage() {
  const { t } = useTranslation();
  const { toolId } = useParams<{ toolId: string }>();
  const { tools, setToolConfig } = useTools();

  if (!toolId) return null;

  const definition = getTool(toolId);
  if (!definition) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-(--color-label-tertiary)">
        {t('settings.tool.notFound')}
      </div>
    );
  }

  const state = tools.find((ts) => ts.id === toolId);
  const config = state?.config ?? definition.defaultConfig();
  const { ConfigForm } = definition;

  return (
    <div className="p-4 space-y-4" key={toolId}>
      <p className="text-[13px] text-(--color-label-secondary)">{definition.description}</p>
      <ConfigForm
        config={config}
        onSave={(newConfig) => setToolConfig(toolId, newConfig)}
      />
    </div>
  );
}
