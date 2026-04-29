import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, MessageSquareQuote } from 'lucide-react';
import { DEFAULT_TOGGLE_OPTIONS } from '../../hooks/usePrompts';
import type { PromptRow, PromptVariable } from '../../hooks/usePrompts';

interface PromptPreviewProps {
  prompt: PromptRow;
  variableValues: Record<string, string>;
  onVariableChange: (name: string, value: string) => void;
  onRemove: () => void;
  showErrors?: boolean;
}

/** Inline prompt preview with editable variable inputs. */
export default function PromptPreview({
  prompt,
  variableValues,
  onVariableChange,
  onRemove,
  showErrors = false,
}: PromptPreviewProps) {
  const parts = splitContent(prompt.content, prompt.variables);
  const hasVariables = prompt.variables.length > 0;

  return (
    <div className="px-3 pt-3 pb-1 space-y-1.5">
      <div className="relative group inline-flex">
        <div className="h-7 rounded-lg border border-(--color-accent)/30 bg-(--color-accent)/10 flex items-center gap-1.5 px-2.5">
          <MessageSquareQuote className="w-3.5 h-3.5 text-(--color-accent) shrink-0" />
          <span className="text-xs text-(--color-accent) truncate max-w-60">
            {prompt.title}
          </span>
        </div>
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-(--color-bg-control) border border-(--color-separator) flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
        >
          <X className="w-3 h-3 text-(--color-label-secondary)" />
        </button>
      </div>
      {hasVariables && (
        <div className="text-xs text-(--color-label-secondary) leading-6">
          {parts.map((part, i) =>
            part.type === 'text' ? (
              <span key={i}>{part.value}</span>
            ) : (
              // key 带上 prompt.id + updated_at：切换 prompt 或同一 prompt 被后台编辑后，
              // VariableInput 重新 mount 以丢弃上一次的本地 local state。
              <VariableInput
                key={`${prompt.id}-${prompt.updated_at}-${part.value}-${i}`}
                name={part.value}
                value={variableValues[part.value] ?? ''}
                onChange={(v) => onVariableChange(part.value, v)}
                hasError={showErrors && !variableValues[part.value]?.trim()}
                variable={part.variable}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function VariableInput({
  name,
  value,
  onChange,
  hasError = false,
  variable,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
  variable?: PromptVariable;
}) {
  const [local, setLocal] = useState(value);
  const type = variable?.type ?? 'input';

  const handleBlur = useCallback(() => {
    if (local !== value) onChange(local);
  }, [local, value, onChange]);

  const baseClass = hasError
    ? 'border-red-500 bg-red-500/10 text-red-500 placeholder:text-red-400 animate-shake'
    : 'border-(--color-accent)/40 bg-(--color-accent)/5 text-(--color-accent) placeholder:text-(--color-accent)/50 focus:border-(--color-accent)';

  const { t } = useTranslation();

  if (type === 'select') {
    const options = variable?.options ?? [];
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`inline h-5 mx-0.5 px-1 rounded border text-xs focus:outline-none align-middle transition-colors ${baseClass}`}
      >
        {!value && <option value="">{t('settings.prompt.selectPrompt', { name })}</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (type === 'toggle') {
    const options = variable?.options ?? [...DEFAULT_TOGGLE_OPTIONS];
    const isOn = value === options[0];
    return (
      <button
        type="button"
        onClick={() => onChange(isOn ? options[1] : options[0])}
        className={`inline-flex items-center gap-1 h-5 mx-0.5 px-1.5 rounded border text-xs align-middle transition-colors ${baseClass}`}
      >
        <span className={`w-2 h-2 rounded-full ${isOn ? 'bg-(--color-accent)' : 'bg-(--color-label-tertiary)/40'}`} />
        {value || name}
      </button>
    );
  }

  if (type === 'textarea') {
    const displayText = local || name;
    const charWidth = Math.max(displayText.length + 1.5, 8);
    return (
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        placeholder={name}
        rows={2}
        className={`inline-block mx-0.5 px-1.5 py-0.5 rounded border text-xs focus:outline-none align-middle transition-colors resize-y ${baseClass}`}
        style={{ width: `${charWidth}em`, minHeight: '2.5em' }}
      />
    );
  }

  // Default: input
  const displayText = local || name;
  const charWidth = displayText.length <= 2 ? 4 : displayText.length + 1.5;

  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={handleBlur}
      placeholder={name}
      className={`inline h-5 mx-0.5 px-1.5 rounded border text-xs focus:outline-none align-middle transition-colors ${baseClass}`}
      style={{ width: `${charWidth}em` }}
    />
  );
}

type ContentPart = { type: 'text'; value: string } | { type: 'variable'; value: string; variable: PromptVariable };

/** Split prompt content into text parts and variable placeholders. */
function splitContent(content: string, variables: PromptVariable[]): ContentPart[] {
  const varMap = new Map(variables.map((v) => [v.name, v]));
  const parts: ContentPart[] = [];
  const regex = /\{\{(.+?)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1].trim();
    const variable = varMap.get(name);
    if (!variable) continue;
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'variable', value: name, variable });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return parts;
}

/** Check if any required variables are not filled. */
export function hasUnfilledVariables(prompt: PromptRow, values: Record<string, string>): boolean {
  return prompt.variables.some((v) => !values[v.name]?.trim());
}

/** Replace {{变量名}} with values, keeping unreplaced ones as-is. */
export function replaceVariables(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{(.+?)\}\}/g, (full, name: string) => {
    const trimmed = name.trim();
    if (trimmed in values) return values[trimmed];
    return full;
  });
}