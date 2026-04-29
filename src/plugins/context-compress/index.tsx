import { useTranslation } from 'react-i18next';
import { useModels } from '../../hooks/useModels';
import { NativeSelect, NativeInput } from '../../components/ui/native';
import { FormField } from '../../components/Settings/FormField';
import { registerPlugin } from '../../lib/plugin-registry';
import type { PluginFormProps } from '../../lib/plugin-registry';
import { compressContextHook } from './compress';
import i18n from '../../locales';

function CompressConfigForm({ config, onSave }: PluginFormProps) {
  const { t } = useTranslation();
  const { models } = useModels();
  const threshold = (config.threshold as number) ?? 20;
  const selectedProviderId = config.provider_id as number | null;
  const selectedModelId = (config.model_id as string) ?? '';

  const providerMap = new Map<number, { name: string }>();
  for (const m of models) {
    if (!providerMap.has(m.providerId)) {
      providerMap.set(m.providerId, { name: m.providerName });
    }
  }

  const filteredModels = selectedProviderId !== null
    ? models.filter((m) => m.providerId === selectedProviderId)
    : [];

  return (
    <div className="space-y-4">
      <FormField label={t('plugin.contextCompress.threshold')} desc={t('plugin.contextCompress.thresholdDesc')}>
        <NativeInput
          type="number"
          min={6}
          max={100}
          value={threshold}
          onChange={(e) => onSave({ ...config, threshold: Number(e.target.value) || 20 })}
        />
      </FormField>

      <FormField label={t('plugin.contextCompress.providerModel')} desc={t('plugin.contextCompress.providerModelDesc')}>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <NativeSelect
              className="w-full"
              value={selectedProviderId === null ? '' : String(selectedProviderId)}
              onChange={(e) => {
                const val = e.target.value;
                onSave({
                  ...config,
                  provider_id: val === '' ? null : Number(val),
                  model_id: '',
                });
              }}
            >
              <option value="">{t('plugin.contextCompress.followConversation')}</option>
              {Array.from(providerMap.entries()).map(([id, { name }]) => (
                <option key={id} value={String(id)}>{name}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex-1 min-w-0">
            <NativeSelect
              className="w-full"
              value={selectedModelId}
              disabled={selectedProviderId === null}
              onChange={(e) => onSave({ ...config, model_id: e.target.value })}
            >
              <option value="">{t('plugin.contextCompress.selectModel')}</option>
              {filteredModels.map((m) => (
                <option key={m.modelId} value={m.modelId}>{m.modelName}</option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </FormField>
    </div>
  );
}

registerPlugin({
  id: 'context-compress',
  name: i18n.t('plugin.contextCompress.title'),
  description: i18n.t('plugin.contextCompress.desc'),
  icon: 'archive',
  defaultConfig: () => ({
    threshold: 20,
    provider_id: null,
    model_id: '',
  }),
  ConfigForm: CompressConfigForm,
  hooks: { onResponseReceived: compressContextHook },
});
