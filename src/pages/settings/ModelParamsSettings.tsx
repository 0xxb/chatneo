import { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, RefreshCw } from 'lucide-react';
import { SettingGroup, SettingRow } from '../../components/Settings/SettingGroup';
import { NativeSelect, NativeInput } from '../../components/ui/native';
import { useSettings } from '../../hooks/useSettings';
import { safeJsonParse } from '../../lib/utils';
import { getCatalogInfo, refreshModelCatalog } from '../../lib/model-catalog';

function StopSequencesInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const tags = safeJsonParse<string[]>(value || '[]', []);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange(JSON.stringify([...tags, trimmed]));
    setInput('');
  };

  const removeTag = (index: number) => {
    const next = tags.filter((_, i) => i !== index);
    onChange(next.length ? JSON.stringify(next) : '');
  };

  return (
    <div className="w-64">
      <div className="flex flex-wrap gap-1 mb-1.5">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-(--color-fill-secondary) text-[11px] text-(--color-label-secondary) group"
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
      <NativeInput
        placeholder={t('settings.modelParams.stopSeqHint')}
        className="w-full"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addTag(input);
          }
        }}
      />
    </div>
  );
}

interface CustomHeadersEditorRef {
  addRow: () => void;
}

const CustomHeadersEditor = forwardRef<CustomHeadersEditorRef, {
  value: string;
  onChange: (value: string) => void;
}>(function CustomHeadersEditor({ value, onChange }, ref) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<[string, string][]>(() => {
    const parsed = safeJsonParse<Record<string, string>>(value || '{}', {});
    return Object.entries(parsed) as [string, string][];
  });

  const persist = (entries: [string, string][]) => {
    const obj: Record<string, string> = {};
    for (const [k, v] of entries) {
      if (k.trim()) obj[k.trim()] = v;
    }
    onChange(Object.keys(obj).length ? JSON.stringify(obj) : '');
  };

  const addRow = () => {
    setRows((prev) => [...prev, ['', '']]);
  };

  useImperativeHandle(ref, () => ({ addRow }));

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    persist(next);
  };

  const updateRow = (index: number, field: 0 | 1, val: string) => {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? (field === 0 ? [val, row[1]] : [row[0], val]) as [string, string] : row,
      ),
    );
  };

  const handleBlur = () => {
    persist(rows);
  };

  return (
    <div className="w-full">
      {rows.length > 0 ? (
        <div className="border border-(--color-separator) rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-(--color-label-tertiary) text-[12px] bg-(--color-fill-secondary)">
                <th className="py-1.5 px-2 font-normal">Key</th>
                <th className="py-1.5 px-2 font-normal">Value</th>
                <th className="py-1.5 px-2 font-normal w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, val], i) => (
                <tr key={i} className="group border-t border-(--color-separator)/40">
                  <td className="py-1 px-2">
                    <input
                      value={key}
                      onChange={(e) => updateRow(i, 0, e.target.value)}
                      onBlur={handleBlur}
                      placeholder={t('settings.modelParams.headerName')}
                      className="w-full bg-transparent text-(--color-label) text-[13px] outline-none focus:bg-(--color-fill-secondary) rounded px-1 -mx-1"
                    />
                  </td>
                  <td className="py-1 px-2">
                    <input
                      value={val}
                      onChange={(e) => updateRow(i, 1, e.target.value)}
                      onBlur={handleBlur}
                      placeholder={t('settings.modelParams.headerValue')}
                      className="w-full bg-transparent text-(--color-label) text-[13px] outline-none focus:bg-(--color-fill-secondary) rounded px-1 -mx-1"
                    />
                  </td>
                  <td className="py-1 px-2 w-12">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => removeRow(i)}
                        className="p-1 rounded text-(--color-label-tertiary) hover:text-(--color-destructive) hover:bg-(--color-fill-secondary) transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-6 text-center text-[13px] text-(--color-label-tertiary)">
          {t('settings.modelParams.noHeaders')}
        </div>
      )}
    </div>
  );
});

export default function ModelParamsSettings() {
  const { t } = useTranslation();
  const { settings, loading, setSetting } = useSettings();
  const [maxOutput, setMaxOutput] = useState<string | null>(null);
  const [topKDraft, setTopKDraft] = useState<string | null>(null);
  const [seedDraft, setSeedDraft] = useState<string | null>(null);
  const [timeoutDraft, setTimeoutDraft] = useState<string | null>(null);
  const headersRef = useRef<CustomHeadersEditorRef>(null);

  if (loading) return null;

  const commitNumber = (key: string, raw: string, setter: (v: string | null) => void) => {
    const trimmed = raw.trim();
    setSetting(key, trimmed);
    setter(null);
  };

  return (
    <div className="max-w-2xl mx-auto p-5 space-y-4">
      <SettingGroup title={t('settings.modelParams.basic')}>
        <SettingRow label={t('settings.modelParams.defaultTemp')} desc={t('settings.modelParams.defaultTempDesc')}>
          <NativeSelect
            value={settings.default_temperature ?? ''}
            onChange={(e) => setSetting('default_temperature', e.target.value)}
          >
            <option value="">{t('common.default')}</option>
            <option value="0">0</option>
            <option value="0.3">0.3</option>
            <option value="0.5">0.5</option>
            <option value="0.7">0.7</option>
            <option value="1.0">1.0</option>
            <option value="1.5">1.5</option>
            <option value="2.0">2.0</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.modelParams.defaultMaxOutput')} desc={t('settings.modelParams.defaultMaxOutputDesc')}>
          <NativeInput
            type="number"
            placeholder={t('settings.modelParams.emptyDefault')}
            min={1}
            className="w-32"
            value={maxOutput ?? settings.default_max_output_tokens ?? ''}
            onChange={(e) => setMaxOutput(e.target.value)}
            onBlur={(e) => commitNumber('default_max_output_tokens', e.target.value, setMaxOutput)}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.modelParams.intermediate')}>
        <SettingRow label={t('settings.modelParams.topP')} desc={t('settings.modelParams.topPDesc')}>
          <NativeSelect
            value={settings.default_top_p ?? ''}
            onChange={(e) => setSetting('default_top_p', e.target.value)}
          >
            <option value="">{t('common.default')}</option>
            <option value="0.1">0.1</option>
            <option value="0.2">0.2</option>
            <option value="0.3">0.3</option>
            <option value="0.5">0.5</option>
            <option value="0.7">0.7</option>
            <option value="0.8">0.8</option>
            <option value="0.9">0.9</option>
            <option value="0.95">0.95</option>
            <option value="1.0">1.0</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.modelParams.topK')} desc={t('settings.modelParams.topKDesc')}>
          <NativeInput
            type="number"
            placeholder={t('settings.modelParams.emptyDefault')}
            min={1}
            className="w-32"
            value={topKDraft ?? settings.default_top_k ?? ''}
            onChange={(e) => setTopKDraft(e.target.value)}
            onBlur={(e) => commitNumber('default_top_k', e.target.value, setTopKDraft)}
          />
        </SettingRow>
        <SettingRow label={t('settings.modelParams.freqPenalty')} desc={t('settings.modelParams.freqPenaltyDesc')}>
          <NativeSelect
            value={settings.default_frequency_penalty ?? ''}
            onChange={(e) => setSetting('default_frequency_penalty', e.target.value)}
          >
            <option value="">{t('common.default')}</option>
            <option value="-2">-2.0</option>
            <option value="-1">-1.0</option>
            <option value="-0.5">-0.5</option>
            <option value="0">0</option>
            <option value="0.5">0.5</option>
            <option value="1">1.0</option>
            <option value="1.5">1.5</option>
            <option value="2">2.0</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.modelParams.presPenalty')} desc={t('settings.modelParams.presPenaltyDesc')}>
          <NativeSelect
            value={settings.default_presence_penalty ?? ''}
            onChange={(e) => setSetting('default_presence_penalty', e.target.value)}
          >
            <option value="">{t('common.default')}</option>
            <option value="-2">-2.0</option>
            <option value="-1">-1.0</option>
            <option value="-0.5">-0.5</option>
            <option value="0">0</option>
            <option value="0.5">0.5</option>
            <option value="1">1.0</option>
            <option value="1.5">1.5</option>
            <option value="2">2.0</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.modelParams.stopSequences')} desc={t('settings.modelParams.stopSequencesDesc')}>
          <StopSequencesInput
            value={settings.default_stop_sequences ?? ''}
            onChange={(v) => setSetting('default_stop_sequences', v)}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.modelParams.advancedSection')}>
        <SettingRow label={t('settings.modelParams.seed')} desc={t('settings.modelParams.seedDesc')}>
          <NativeInput
            type="number"
            placeholder={t('settings.modelParams.seedPlaceholder')}
            min={0}
            className="w-32"
            value={seedDraft ?? settings.default_seed ?? ''}
            onChange={(e) => setSeedDraft(e.target.value)}
            onBlur={(e) => commitNumber('default_seed', e.target.value, setSeedDraft)}
          />
        </SettingRow>
        <SettingRow label={t('settings.modelParams.maxRetries')} desc={t('settings.modelParams.maxRetriesDesc')}>
          <NativeSelect
            value={settings.default_max_retries ?? ''}
            onChange={(e) => setSetting('default_max_retries', e.target.value)}
          >
            <option value="">{t('settings.modelParams.maxRetriesDefault')}</option>
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.modelParams.timeout')} desc={t('settings.modelParams.timeoutDesc')}>
          <NativeInput
            type="number"
            placeholder={t('settings.modelParams.timeoutDefault')}
            min={1000}
            step={1000}
            className="w-32"
            value={timeoutDraft ?? settings.default_timeout ?? ''}
            onChange={(e) => setTimeoutDraft(e.target.value)}
            onBlur={(e) => commitNumber('default_timeout', e.target.value, setTimeoutDraft)}
          />
        </SettingRow>
        <div className="px-3 py-1.5 space-y-2">
          <div className="flex items-center gap-1">
            <div className="mr-auto">
              <span className="text-[13px] text-(--color-label) block">{t('settings.modelParams.customHeaders')}</span>
              <span className="text-[11px] text-(--color-label-secondary) block">{t('settings.modelParams.customHeadersDesc')}</span>
            </div>
            <button
              onClick={() => headersRef.current?.addRow()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] text-(--color-label-secondary) hover:bg-(--color-fill-secondary) transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('common.add')}
            </button>
          </div>
          <CustomHeadersEditor
            ref={headersRef}
            value={settings.default_custom_headers ?? ''}
            onChange={(v) => setSetting('default_custom_headers', v)}
          />
        </div>
      </SettingGroup>

      <ModelCatalogSection />
    </div>
  );
}

function ModelCatalogSection() {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<{ message: string; ok: boolean } | null>(null);
  const info = getCatalogInfo();

  const lastUpdated = info.lastUpdated
    ? new Date(info.lastUpdated).toLocaleDateString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : t('common.unknown');

  const handleRefresh = async () => {
    setRefreshing(true);
    setResult(null);
    try {
      const { modelCount } = await refreshModelCatalog();
      setResult({ message: t('settings.modelParams.updatedModels', { count: modelCount }), ok: true });
    } catch (err) {
      setResult({ message: t('settings.modelParams.updateFailed', { error: err instanceof Error ? err.message : t('settings.modelParams.unknownError') }), ok: false });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SettingGroup title={t('settings.modelParams.modelCapabilities')}>
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[13px] text-(--color-label) block">{t('settings.modelParams.modelCapabilitiesDb')}</span>
            <span className="text-[11px] text-(--color-label-secondary) block">
              {t('settings.modelParams.catalogStats', { count: info.modelCount, date: lastUpdated })}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-(--color-label-secondary) hover:bg-(--color-fill-secondary) transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? t('settings.modelParams.updating') : t('settings.modelParams.updateFromCloud')}
          </button>
        </div>
        {result && (
          <div className={`text-[11px] ${result.ok ? 'text-(--color-label-secondary)' : 'text-(--color-destructive)'}`}>
            {result.message}
          </div>
        )}
      </div>
    </SettingGroup>
  );
}
