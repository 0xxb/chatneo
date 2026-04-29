import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ask } from '@tauri-apps/plugin-dialog';
import { Settings, Trash2, Plus, RefreshCw, Trash } from 'lucide-react';
import { ModelSettingModal } from './ModelSettingModal';
import type { Model, ModelManagerProps } from './types';

function genId() {
  return crypto.randomUUID();
}

function ModelRow({
  model,
  onUpdate,
  onDelete,
  onOpenSettings,
}: {
  model: Model;
  onUpdate: (patch: Partial<Model>) => void;
  onDelete: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  return (
    <tr className="group border-t border-(--color-separator)/40">
      <td className="py-1 px-2">
        <input
          className="w-full bg-transparent text-(--color-label) text-[13px] outline-none focus:bg-(--color-fill-secondary) rounded px-1 -mx-1"
          value={name ?? model.name}
          placeholder={t('model.displayName')}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== null) {
              onUpdate({ name });
              setName(null);
            }
          }}
        />
      </td>
      <td className="py-1 px-2">
        <input
          className="w-full bg-transparent text-(--color-label) text-[13px] outline-none focus:bg-(--color-fill-secondary) rounded px-1 -mx-1 font-mono"
          value={modelId ?? model.modelId}
          placeholder={t('model.modelId')}
          onChange={(e) => setModelId(e.target.value)}
          onBlur={() => {
            if (modelId !== null) {
              onUpdate({ modelId });
              setModelId(null);
            }
          }}
        />
      </td>
      <td className="py-1 px-2">
        <div className="flex items-center justify-end gap-0.5">
          <button
            onClick={onOpenSettings}
            className="p-1 rounded text-(--color-label-tertiary) hover:text-(--color-label) hover:bg-(--color-fill-secondary) transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded text-(--color-label-tertiary) hover:text-(--color-destructive) hover:bg-(--color-fill-secondary) transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ModelManager({ title, value, onChange, onFetchModels, isFetchingModels }: ModelManagerProps) {
  const { t } = useTranslation();
  const [settingModel, setSettingModel] = useState<Model | null>(null);

  const updateModel = (id: string, patch: Partial<Model>) => {
    onChange(value.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const deleteModel = async (model: Model) => {
    const label = model.name || model.modelId || t('model.thisModel');
    const confirmed = await ask(t('model.deleteConfirm', { name: label }), {
      title: t('model.deleteTitle'),
      kind: 'warning',
    });
    if (!confirmed) return;
    onChange(value.filter((m) => m.id !== model.id));
  };

  const addModel = () => {
    const model: Model = { id: genId(), name: '', modelId: '' };
    onChange([...value, model]);
  };

  const clearAll = async () => {
    if (value.length === 0) return;
    const confirmed = await ask(t('model.deleteAllConfirm'), {
      title: t('model.deleteAllTitle'),
      kind: 'warning',
    });
    if (!confirmed) return;
    onChange([]);
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-1">
        {title && (
          <span className="text-[13px] text-(--color-label) mr-auto">{title}</span>
        )}
        <button
          onClick={clearAll}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] text-(--color-label-secondary) hover:bg-(--color-fill-secondary) transition-colors"
        >
          <Trash className="w-3.5 h-3.5" />
          {t('model.deleteAll')}
        </button>
        <button
          onClick={addModel}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] text-(--color-accent) hover:bg-(--color-fill-secondary) transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('model.new')}
        </button>
        {onFetchModels && (
          <button
            onClick={onFetchModels}
            disabled={isFetchingModels}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] text-(--color-label-secondary) hover:bg-(--color-fill-secondary) transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} />
            {t('model.fetchModels')}
          </button>
        )}
      </div>

      {/* Table */}
      {value.length > 0 ? (
        <div className="border border-(--color-separator) rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-(--color-label-tertiary) text-[12px] bg-(--color-fill-secondary)">
                <th className="py-1.5 px-2 font-normal">{t('common.name')}</th>
                <th className="py-1.5 px-2 font-normal">{t('model.modelId')}</th>
                <th className="py-1.5 px-2 font-normal w-16 text-right">{t('model.operations')}</th>
              </tr>
            </thead>
            <tbody>
              {value.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  onUpdate={(patch) => updateModel(model.id, patch)}
                  onDelete={() => deleteModel(model)}
                  onOpenSettings={() => setSettingModel(model)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-8 text-center text-[13px] text-(--color-label-tertiary)">
          {t('model.noModels')}
        </div>
      )}

      {/* Settings Modal */}
      <ModelSettingModal
        model={settingModel}
        onClose={() => setSettingModel(null)}
        onSave={(updated) => {
          updateModel(updated.id, updated);
          setSettingModel(null);
        }}
      />
    </div>
  );
}

export type { Model, ModelCapabilities, ModelManagerProps } from './types';
