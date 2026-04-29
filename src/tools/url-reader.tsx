import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { registerTool, type ToolFormProps } from '../lib/tool-registry';
import { FormField } from '../components/Settings/FormField';
import { NativeSelect, NativeInput } from '../components/ui/native';
import i18n from '../locales';

interface UrlReaderConfig {
  maxLength: number;
  timeout: number;
}

function UrlReaderConfigForm({ config, onSave }: ToolFormProps) {
  const { t } = useTranslation();
  const cfg = config as unknown as UrlReaderConfig;

  const update = (patch: Partial<UrlReaderConfig>) => onSave({ ...cfg, ...patch });

  return (
    <div className="space-y-4">
      <FormField label={t('tools.urlReader.maxLength')} desc={t('tools.urlReader.maxLengthDesc')}>
        <NativeSelect
          value={String(cfg.maxLength)}
          onChange={(e) => update({ maxLength: Number(e.target.value) })}
        >
          <option value="4000">4000</option>
          <option value="8000">8000</option>
          <option value="16000">16000</option>
          <option value="32000">32000</option>
        </NativeSelect>
      </FormField>
      <FormField label={t('tools.urlReader.timeout')} desc={t('tools.urlReader.timeoutDesc')}>
        <NativeInput
          type="number"
          value={String(cfg.timeout)}
          min="5"
          max="60"
          onChange={(e) => update({ timeout: Number(e.target.value) })}
        />
      </FormField>
    </div>
  );
}

registerTool({
  id: 'url-reader',
  name: i18n.t('tools.urlReader.name'),
  description: i18n.t('tools.urlReader.desc'),
  icon: '🌐',
  enabledByDefault: false,
  defaultConfig: () => ({
    maxLength: 8000,
    timeout: 10,
  }),
  ConfigForm: UrlReaderConfigForm,
  createToolSpec: (config) => {
    const cfg = config as unknown as UrlReaderConfig;
    return tool({
      description: 'Fetch and extract the main text content from a URL',
      inputSchema: zodSchema(
        z.object({
          url: z.string().describe('The URL to read'),
        }),
      ),
      execute: async ({ url }) => {
        try {
          const result = await invoke<{ title: string; content: string; url: string }>(
            'tool_read_url',
            { url, maxLength: cfg.maxLength, timeoutSecs: cfg.timeout },
          );
          return result;
        } catch (e) {
          return { error: `读取失败: ${e}` };
        }
      },
    });
  },
});
