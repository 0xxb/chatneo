import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { useTranslation } from 'react-i18next';
import { registerTool, type ToolFormProps } from '../lib/tool-registry';
import i18n from '../locales';

function CurrentTimeConfigForm({}: ToolFormProps) {
  const { t } = useTranslation();
  return (
    <p className="text-[12px] text-(--color-label-tertiary)">
      {t('tools.currentTime.configDesc')}
    </p>
  );
}

registerTool({
  id: 'current-time',
  name: i18n.t('tools.currentTime.name'),
  description: i18n.t('tools.currentTime.desc'),
  icon: '🕐',
  enabledByDefault: true,
  defaultConfig: () => ({}),
  ConfigForm: CurrentTimeConfigForm,
  createToolSpec: () =>
    tool({
      description: 'Get the current date and time',
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        const now = new Date();
        return {
          datetime: now.toISOString(),
          formatted: now.toLocaleString('zh-CN', {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      },
    }),
});
