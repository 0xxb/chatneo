import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, RotateCcw, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/Popover';
import { Tooltip } from '../ui/Tooltip';

type Tab = 'basic' | 'advanced' | 'expert';

const inputClass =
  'w-full h-7 rounded-md border border-(--color-separator) bg-(--color-bg-control) px-2 text-xs text-(--color-label) placeholder:text-(--color-label-tertiary) focus:outline-none focus:border-(--color-accent)';

function SliderField({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  formatValue,
  onChange,
  leftLabel,
  rightLabel,
}: {
  label: string;
  value: number | null;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  formatValue?: (v: number) => string;
  onChange: (v: number | null) => void;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const { t } = useTranslation();
  const fmt = formatValue ?? ((v: number) => v.toFixed(1));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-(--color-label)">{label}</span>
        <span className="text-xs tabular-nums text-(--color-label-secondary)">
          {value !== null ? fmt(value) : t('common.default')}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? defaultValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-(--color-accent)"
      />
      {leftLabel && rightLabel && (
        <div className="flex justify-between text-[10px] text-(--color-label-tertiary)">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  placeholder,
  min,
  onChange,
}: {
  label: string;
  value: number | null;
  placeholder?: string;
  min?: number;
  onChange: (v: number | null) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange(null);
    } else {
      const n = parseInt(trimmed, 10);
      if (Number.isFinite(n) && (min === undefined || n >= min)) onChange(n);
    }
    setDraft(null);
  };

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-(--color-label)">{label}</span>
      <input
        type="number"
        placeholder={placeholder ?? t('common.default')}
        min={min}
        value={draft ?? (value !== null ? String(value) : '')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
          }
        }}
        className={inputClass}
      />
    </div>
  );
}

function StopSequencesTags({
  value,
  onChange,
}: {
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const tags = value ?? [];

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInput('');
  };

  const removeTag = (index: number) => {
    const next = tags.filter((_, i) => i !== index);
    onChange(next.length ? next : null);
  };

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-(--color-label)">{t('params.stopSequences')}</span>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-(--color-fill-secondary) text-[11px] text-(--color-label-secondary)"
            >
              {tag}
              <button
                onClick={() => removeTag(i)}
                className="opacity-50 hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        placeholder={t('settings.modelParams.stopSeqHint')}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addTag(input);
          }
        }}
        className={inputClass}
      />
    </div>
  );
}

interface ModelParamsButtonProps {
  temperature: number | null;
  maxOutputTokens: number | null;
  topP: number | null;
  topK: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  stopSequences: string[] | null;
  seed: number | null;
  onTemperatureChange: (value: number | null) => void;
  onMaxOutputTokensChange: (value: number | null) => void;
  onTopPChange: (value: number | null) => void;
  onTopKChange: (value: number | null) => void;
  onFrequencyPenaltyChange: (value: number | null) => void;
  onPresencePenaltyChange: (value: number | null) => void;
  onStopSequencesChange: (value: string[] | null) => void;
  onSeedChange: (value: number | null) => void;
  onReset: () => void;
}

export default function ModelParamsButton({
  temperature,
  maxOutputTokens,
  topP,
  topK,
  frequencyPenalty,
  presencePenalty,
  stopSequences,
  seed,
  onTemperatureChange,
  onMaxOutputTokensChange,
  onTopPChange,
  onTopKChange,
  onFrequencyPenaltyChange,
  onPresencePenaltyChange,
  onStopSequencesChange,
  onSeedChange,
  onReset,
}: ModelParamsButtonProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('basic');

  const TABS = useMemo<{ key: Tab; label: string }[]>(() => [
    { key: 'basic', label: t('params.basic') },
    { key: 'advanced', label: t('params.intermediate') },
    { key: 'expert', label: t('params.advanced') },
  ], [t]);

  const hasOverride =
    temperature !== null ||
    maxOutputTokens !== null ||
    topP !== null ||
    topK !== null ||
    frequencyPenalty !== null ||
    presencePenalty !== null ||
    stopSequences !== null ||
    seed !== null;

  return (
    <Popover>
      <Tooltip content={t('params.modelParams')}>
        <PopoverTrigger asChild>
          <button
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
              hasOverride
                ? 'text-(--color-accent) bg-(--color-accent)/10'
                : 'text-(--color-label-secondary) hover:bg-(--color-fill)'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" align="start" className="w-72 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Tab bar */}
        <div className="flex gap-3 mb-3 border-b border-(--color-separator)">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-1.5 text-xs transition-colors outline-none ${
                tab === key
                  ? 'text-(--color-label) border-b-2 border-(--color-accent) font-medium'
                  : 'text-(--color-label-tertiary) hover:text-(--color-label-secondary)'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="space-y-3">
          {tab === 'basic' && (
            <>
              <SliderField
                label={t('params.temperature')}
                value={temperature}
                defaultValue={1}
                min={0}
                max={2}
                step={0.1}
                onChange={onTemperatureChange}
                leftLabel={t('params.precise')}
                rightLabel={t('params.creative')}
              />
              <NumberField
                label={t('params.maxOutput')}
                value={maxOutputTokens}
                min={1}
                onChange={onMaxOutputTokensChange}
              />
            </>
          )}

          {tab === 'advanced' && (
            <>
              <SliderField
                label={t('params.topP')}
                value={topP}
                defaultValue={1}
                min={0}
                max={1}
                step={0.05}
                onChange={onTopPChange}
              />
              <NumberField
                label={t('params.topK')}
                value={topK}
                min={1}
                onChange={onTopKChange}
              />
              <SliderField
                label={t('params.freqPenalty')}
                value={frequencyPenalty}
                defaultValue={0}
                min={-2}
                max={2}
                step={0.1}
                onChange={onFrequencyPenaltyChange}
              />
              <SliderField
                label={t('params.presPenalty')}
                value={presencePenalty}
                defaultValue={0}
                min={-2}
                max={2}
                step={0.1}
                onChange={onPresencePenaltyChange}
              />
              <StopSequencesTags
                value={stopSequences}
                onChange={onStopSequencesChange}
              />
            </>
          )}

          {tab === 'expert' && (
            <NumberField
              label={t('params.seed')}
              value={seed}
              placeholder={t('params.seedPlaceholder')}
              min={0}
              onChange={onSeedChange}
            />
          )}
        </div>

        {/* Reset button */}
        {hasOverride && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-(--color-label-tertiary) hover:text-(--color-label-secondary) transition-colors mt-3"
          >
            <RotateCcw className="w-3 h-3" />
            {t('common.reset')}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
