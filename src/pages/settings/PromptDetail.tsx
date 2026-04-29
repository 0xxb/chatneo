import { useState, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { FormField } from '../../components/Settings/FormField';
import { NativeInput } from '../../components/ui/native';
import { NativeSelect } from '../../components/ui/NativeSelect';
import { DEFAULT_TOGGLE_OPTIONS, PROMPT_CATEGORIES, CATEGORY_I18N } from '../../hooks/usePrompts';
import type { PromptVariable, PromptVariableType, PromptCategory } from '../../hooks/usePrompts';
import type { OutletContextType } from './PromptSettings';

export default function PromptDetail() {
  const { t } = useTranslation();
  const { promptId } = useParams<{ promptId: string }>();
  const { prompts, updatePrompt } = useOutletContext<OutletContextType>();
  const prompt = prompts.find((p) => p.id === promptId);
  const [title, setTitle] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);

  const saveVariables = useCallback(
    (vars: PromptVariable[]) => {
      if (!prompt) return;
      updatePrompt(prompt.id, 'variables', JSON.stringify(vars));
    },
    [prompt, updatePrompt],
  );

  const addVariable = useCallback(() => {
    if (!prompt) return;
    saveVariables([...prompt.variables, { name: '', type: 'input' }]);
  }, [prompt, saveVariables]);

  const removeVariable = useCallback(
    (index: number) => {
      if (!prompt) return;
      saveVariables(prompt.variables.filter((_, i) => i !== index));
    },
    [prompt, saveVariables],
  );

  const updateVariableName = useCallback(
    (index: number, name: string) => {
      if (!prompt) return;
      const vars = prompt.variables.map((v, i) => (i === index ? { ...v, name } : v));
      saveVariables(vars);
    },
    [prompt, saveVariables],
  );

  const updateVariableField = useCallback(
    (index: number, field: Partial<PromptVariable>) => {
      if (!prompt) return;
      const vars = prompt.variables.map((v, i) => (i === index ? { ...v, ...field } : v));
      saveVariables(vars);
    },
    [prompt, saveVariables],
  );

  if (!prompt) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-(--color-label-tertiary)">
        {t('settings.prompt.selectOrCreate')}
      </div>
    );
  }

  const titleValue = title ?? prompt.title;
  const contentValue = content ?? prompt.content;

  return (
    <div className="p-4 space-y-4" key={prompt.id}>
      <FormField label={t('settings.prompt.titleLabel')}>
        <NativeInput
          value={titleValue}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== null && title.trim()) {
              updatePrompt(prompt.id, 'title', title.trim());
              setTitle(null);
            } else {
              setTitle(null);
            }
          }}
          placeholder={t('settings.prompt.titlePlaceholder')}
        />
      </FormField>
      <FormField label={t('settings.prompt.category')}>
        <NativeSelect
          value={prompt.category}
          onChange={(e) => updatePrompt(prompt.id, 'category', e.target.value as PromptCategory)}
        >
          <option value="">{t('settings.prompt.uncategorized')}</option>
          {PROMPT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{t(CATEGORY_I18N[cat])}</option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label={t('settings.prompt.content')} desc={t('settings.prompt.contentHint', { placeholder: '{{变量名}}' })}>
        <textarea
          value={contentValue}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => {
            if (content !== null) {
              updatePrompt(prompt.id, 'content', content);
              setContent(null);
            }
          }}
          placeholder={t('settings.prompt.contentPlaceholder')}
          rows={6}
          className="w-full resize-none rounded-md border border-(--color-separator) bg-(--color-bg-control) px-2.5 py-2 text-[13px] text-(--color-label) placeholder:text-(--color-label-tertiary) focus:outline-none focus:border-(--color-accent)"
        />
      </FormField>
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <span className="text-[13px] text-(--color-label) mr-auto">{t('settings.prompt.variables')}</span>
          <button
            onClick={addVariable}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] text-(--color-label-secondary) hover:bg-(--color-fill-secondary) transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('settings.prompt.addVariable')}
          </button>
        </div>
        {prompt.variables.length > 0 ? (
          <div className="border border-(--color-separator) rounded-lg overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-(--color-label-tertiary) text-[12px] bg-(--color-fill-secondary)">
                  <th className="py-1.5 px-2 font-normal">{t('settings.prompt.varName')}</th>
                  <th className="py-1.5 px-2 font-normal w-24">{t('settings.prompt.varType')}</th>
                  <th className="py-1.5 px-2 font-normal w-32">{t('settings.prompt.varDefault')}</th>
                  <th className="py-1.5 px-2 font-normal w-12" />
                </tr>
              </thead>
              <tbody>
                {prompt.variables.map((v, i) => (
                  <VariableRow
                    key={i}
                    variable={v}
                    onNameChange={(name) => updateVariableName(i, name)}
                    onFieldChange={(field) => updateVariableField(i, field)}
                    onRemove={() => removeVariable(i)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-[13px] text-(--color-label-tertiary)">
            {t('settings.prompt.noVariables')}
          </div>
        )}
      </div>
    </div>
  );
}

function VariableRow({
  variable,
  onNameChange,
  onFieldChange,
  onRemove,
}: {
  variable: PromptVariable;
  onNameChange: (name: string) => void;
  onFieldChange: (field: Partial<PromptVariable>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const VARIABLE_TYPE_LABELS: Record<PromptVariableType, string> = {
    input: t('settings.prompt.inputType'),
    textarea: t('settings.prompt.textareaType'),
    select: t('settings.prompt.selectType'),
    toggle: t('settings.prompt.toggleType'),
  };
  const [name, setName] = useState<string | null>(null);
  const [defaultVal, setDefaultVal] = useState<string | null>(null);
  const displayName = name ?? variable.name;
  const displayDefault = defaultVal ?? variable.default ?? '';

  return (
    <>
      <tr className="group border-t border-(--color-separator)/40">
        <td className="py-1 px-2">
          <input
            value={displayName}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name !== null) {
                onNameChange(name.trim());
                setName(null);
              }
            }}
            placeholder={t('settings.prompt.varNamePlaceholder')}
            className="w-full bg-transparent text-(--color-label) text-[13px] outline-none focus:bg-(--color-fill-secondary) rounded px-1 -mx-1"
          />
        </td>
        <td className="py-1 px-2 w-24">
          <select
            value={variable.type}
            onChange={(e) => {
              const type = e.target.value as PromptVariableType;
              const patch: Partial<PromptVariable> = { type };
              if (type === 'select' && !variable.options?.length) {
                patch.options = [t('settings.prompt.defaultOption1'), t('settings.prompt.defaultOption2')];
              }
              if (type === 'toggle' && !variable.default) {
                patch.default = DEFAULT_TOGGLE_OPTIONS[0];
                patch.options = [...DEFAULT_TOGGLE_OPTIONS];
              }
              if (type !== 'select' && type !== 'toggle') {
                patch.options = undefined;
              }
              onFieldChange(patch);
            }}
            className="text-[13px] text-(--color-label-secondary) outline-none rounded px-1 -mx-1 bg-(--color-fill-secondary)"
          >
            {(Object.keys(VARIABLE_TYPE_LABELS) as PromptVariableType[]).map((typeKey) => (
              <option key={typeKey} value={typeKey}>{VARIABLE_TYPE_LABELS[typeKey]}</option>
            ))}
          </select>
        </td>
        <td className="py-1 px-2 w-32">
          {variable.type === 'toggle' ? (
            <select
              value={displayDefault}
              onChange={(e) => onFieldChange({ default: e.target.value })}
              className="text-[13px] text-(--color-label-secondary) outline-none rounded px-1 -mx-1 bg-(--color-fill-secondary)"
            >
              {(variable.options ?? [...DEFAULT_TOGGLE_OPTIONS]).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : variable.type === 'select' ? (
            <span className="text-[12px] text-(--color-label-tertiary)">{t('settings.prompt.seeOptions')}</span>
          ) : (
            <input
              value={displayDefault}
              onChange={(e) => setDefaultVal(e.target.value)}
              onBlur={() => {
                if (defaultVal !== null) {
                  onFieldChange({ default: defaultVal || undefined });
                  setDefaultVal(null);
                }
              }}
              placeholder="无"
              className="w-full bg-transparent text-(--color-label) text-[13px] outline-none focus:bg-(--color-fill-secondary) rounded px-1 -mx-1"
            />
          )}
        </td>
        <td className="py-1 px-2 w-12">
          <div className="flex items-center justify-end">
            <button
              onClick={onRemove}
              className="p-1 rounded text-(--color-label-tertiary) hover:text-(--color-destructive) hover:bg-(--color-fill-secondary) transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {variable.type === 'select' && (
        <tr className="border-t border-(--color-separator)/20">
          <td colSpan={4} className="px-2 py-1.5">
            <OptionsEditor
              options={variable.options ?? []}
              defaultValue={variable.default}
              onChange={(options) => onFieldChange({ options })}
              onDefaultChange={(d) => onFieldChange({ default: d })}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function OptionsEditor({
  options,
  defaultValue,
  onChange,
  onDefaultChange,
}: {
  options: string[];
  defaultValue?: string;
  onChange: (options: string[]) => void;
  onDefaultChange: (value: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] text-(--color-label-tertiary)">{t('settings.prompt.optionList')}</span>
        <span className="text-[11px] text-(--color-label-tertiary)">·</span>
        <span className="text-[11px] text-(--color-label-tertiary)">{t('settings.prompt.optionListHint')}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt, i) => (
          <div key={i} className="inline-flex items-center gap-0.5 h-6 rounded border border-(--color-separator)/60 bg-(--color-fill-secondary) text-[12px]">
            <button
              onClick={() => onDefaultChange(defaultValue === opt ? undefined : opt)}
              className={`px-1 ${defaultValue === opt ? 'text-(--color-accent)' : 'text-(--color-label-tertiary) hover:text-(--color-accent)'}`}
              title={defaultValue === opt ? t('settings.prompt.unsetDefault') : t('settings.prompt.setDefault')}
            >
              ★
            </button>
            {editingIndex === i ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => {
                  if (editValue.trim()) {
                    const next = [...options];
                    next[i] = editValue.trim();
                    onChange(next);
                  }
                  setEditingIndex(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="w-16 bg-transparent text-(--color-label) text-[12px] outline-none"
              />
            ) : (
              <span
                className="text-(--color-label) cursor-text px-0.5"
                onClick={() => { setEditingIndex(i); setEditValue(opt); }}
              >
                {opt}
              </span>
            )}
            <button
              onClick={() => {
                const next = options.filter((_, j) => j !== i);
                onChange(next);
                if (defaultValue === opt) onDefaultChange(undefined);
              }}
              className="px-1 text-(--color-label-tertiary) hover:text-(--color-destructive)"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...options, t('settings.prompt.optionTemplate', { n: options.length + 1 })])}
          className="h-6 px-2 rounded border border-dashed border-(--color-separator) text-[12px] text-(--color-label-tertiary) hover:text-(--color-label-secondary) hover:border-(--color-label-tertiary) transition-colors"
        >
          {t('settings.prompt.addOption')}
        </button>
      </div>
    </div>
  );
}
