import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { registerTool, type ToolFormProps } from '../lib/tool-registry';
import { FormField } from '../components/Settings/FormField';
import { NativeInput, NativeSwitch } from '../components/ui/native';
import i18n from '../locales';

interface CodeRunnerConfig {
  languages: string[];
  timeout: number;
  confirmBeforeRun: boolean;
}

const ALL_LANGUAGES = ['python', 'javascript', 'shell'] as const;

function CodeRunnerConfigForm({ config, onSave }: ToolFormProps) {
  const { t } = useTranslation();
  const cfg = config as unknown as CodeRunnerConfig;

  const update = (patch: Partial<CodeRunnerConfig>) => onSave({ ...cfg, ...patch });

  const toggleLanguage = (lang: string, enabled: boolean) => {
    const langs = enabled
      ? [...cfg.languages, lang]
      : cfg.languages.filter((l) => l !== lang);
    update({ languages: langs });
  };

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-(--color-label-tertiary)">{t('tools.codeRunner.configDesc')}</p>
      <FormField label={t('tools.codeRunner.languages')}>
        <div className="space-y-2 mt-1">
          {ALL_LANGUAGES.map((lang) => (
            <div key={lang} className="flex items-center justify-between">
              <span className="text-[13px] text-(--color-label)">{lang}</span>
              <NativeSwitch
                checked={cfg.languages.includes(lang)}
                onChange={(e) => toggleLanguage(lang, e.target.checked)}
              />
            </div>
          ))}
        </div>
      </FormField>
      <FormField label={t('tools.codeRunner.timeout')}>
        <NativeInput
          type="number"
          value={String(cfg.timeout)}
          min="5"
          max="300"
          onChange={(e) => update({ timeout: Number(e.target.value) })}
        />
      </FormField>
      <FormField label={t('tools.codeRunner.confirmBeforeRun')} desc={t('tools.codeRunner.confirmBeforeRunDesc')}>
        <NativeSwitch
          checked={cfg.confirmBeforeRun}
          onChange={(e) => update({ confirmBeforeRun: e.target.checked })}
        />
      </FormField>
    </div>
  );
}

registerTool({
  id: 'code-runner',
  name: i18n.t('tools.codeRunner.name'),
  description: i18n.t('tools.codeRunner.desc'),
  icon: '⚡',
  enabledByDefault: false,
  defaultConfig: () => ({
    languages: ['python', 'javascript', 'shell'],
    timeout: 30,
    confirmBeforeRun: true,
  }),
  ConfigForm: CodeRunnerConfigForm,
  createToolSpec: (config) => {
    const cfg = config as unknown as CodeRunnerConfig;
    const enabledLanguages = cfg.languages.length > 0
      ? cfg.languages
      : ['python', 'javascript', 'shell'];

    return tool({
      description: `Execute code locally. Supported languages: ${enabledLanguages.join(', ')}`,
      inputSchema: zodSchema(
        z.object({
          language: z
            .enum(['python', 'javascript', 'shell'])
            .describe('Programming language to use'),
          code: z.string().describe('The code to execute'),
        }),
      ),
      execute: async ({ language, code }) => {
        try {
          if (!cfg.languages.includes(language)) {
            return { error: `语言 ${language} 未启用` };
          }
          if (cfg.confirmBeforeRun) {
            const confirmed = window.confirm(
              `即将执行 ${language} 代码:\n\n${code.slice(0, 200)}${code.length > 200 ? '...' : ''}\n\n确认执行？`,
            );
            if (!confirmed) {
              return { error: '用户取消执行' };
            }
          }
          const result = await invoke<{ stdout: string; stderr: string; exit_code: number }>(
            'tool_run_code',
            { language, code, timeoutSecs: cfg.timeout },
          );
          return result;
        } catch (e) {
          return { error: `执行失败: ${e}` };
        }
      },
    });
  },
});
