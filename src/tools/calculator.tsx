import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { useTranslation } from 'react-i18next';
import { registerTool, type ToolFormProps } from '../lib/tool-registry';
import i18n from '../locales';

function CalculatorConfigForm({}: ToolFormProps) {
  const { t } = useTranslation();
  return (
    <p className="text-[12px] text-(--color-label-tertiary)">
      {t('tools.calculator.configDesc')}
    </p>
  );
}

registerTool({
  id: 'calculator',
  name: i18n.t('tools.calculator.name'),
  description: i18n.t('tools.calculator.desc'),
  icon: '🧮',
  enabledByDefault: true,
  defaultConfig: () => ({}),
  ConfigForm: CalculatorConfigForm,
  createToolSpec: () =>
    tool({
      description: 'Evaluate a mathematical expression and return the result',
      inputSchema: zodSchema(
        z.object({
          expression: z.string().describe('The mathematical expression to evaluate, e.g. "(123 + 456) * 789"'),
        }),
      ),
      execute: async ({ expression }) => {
        try {
          if (!/^[\d\s+\-*/().%^]+$/.test(expression)) {
            return { error: '不支持的表达式' };
          }
          const sanitized = expression.replace(/\^/g, '**');
          const result = new Function(`"use strict"; return (${sanitized})`)();
          if (typeof result !== 'number' || !Number.isFinite(result)) {
            return { error: '计算结果无效' };
          }
          return { expression, result };
        } catch {
          return { error: '计算失败，请检查表达式' };
        }
      },
    }),
});
