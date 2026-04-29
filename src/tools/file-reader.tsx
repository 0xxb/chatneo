import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { registerTool, type ToolFormProps } from '../lib/tool-registry';
import { FormField } from '../components/Settings/FormField';
import { NativeInput } from '../components/ui/native';
import i18n from '../locales';

interface FileReaderConfig {
  maxSizeMB: number;
}

function FileReaderConfigForm({ config, onSave }: ToolFormProps) {
  const { t } = useTranslation();
  const cfg = config as unknown as FileReaderConfig;

  const update = (patch: Partial<FileReaderConfig>) => onSave({ ...cfg, ...patch });

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-(--color-label-tertiary)">{t('tools.fileReader.configDesc')}</p>
      <FormField label={t('tools.fileReader.maxSize')} desc={t('tools.fileReader.maxSizeDesc')}>
        <NativeInput
          type="number"
          value={String(cfg.maxSizeMB)}
          min="1"
          max="100"
          onChange={(e) => update({ maxSizeMB: Number(e.target.value) })}
        />
      </FormField>
      <FormField label={t('tools.fileReader.supportedFormats')} desc={t('tools.fileReader.supportedFormatsDesc')}>
        <p className="text-[12px] text-(--color-label-secondary)">
          txt / csv / json / md / pdf / docx / xlsx / xls
        </p>
      </FormField>
    </div>
  );
}

registerTool({
  id: 'file-reader',
  name: i18n.t('tools.fileReader.name'),
  description: i18n.t('tools.fileReader.desc'),
  icon: '📄',
  enabledByDefault: true,
  defaultConfig: () => ({
    maxSizeMB: 10,
  }),
  ConfigForm: FileReaderConfigForm,
  createToolSpec: (config) => {
    const cfg = config as unknown as FileReaderConfig;
    return tool({
      description: 'Read and parse content from a local file',
      inputSchema: zodSchema(
        z.object({
          path: z.string().describe('Absolute path to the file to read'),
        }),
      ),
      execute: async ({ path }) => {
        try {
          const result = await invoke<{ filename: string; file_type: string; content: string; size: number }>(
            'tool_read_file',
            { path, maxSize: cfg.maxSizeMB * 1024 * 1024 },
          );
          return result;
        } catch (e) {
          return { error: `文件读取失败: ${e}` };
        }
      },
    });
  },
});
