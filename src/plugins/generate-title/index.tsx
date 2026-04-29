import { useTranslation } from 'react-i18next';
import { useModels } from '../../hooks/useModels';
import { NativeSelect } from '../../components/ui/native';
import { FormField } from '../../components/Settings/FormField';
import { registerPlugin } from '../../lib/plugin-registry';
import type { PluginFormProps } from '../../lib/plugin-registry';
import { generateTitleHook } from './generate-title';
import i18n from '../../locales';

function GenerateTitleConfigForm({ config, onSave }: PluginFormProps) {
  const { t } = useTranslation();
  const { models } = useModels();
  const trigger = (config.trigger as string) ?? 'first_message';
  const selectedProviderId = config.provider_id as number | null;
  const selectedModelId = (config.model_id as string) ?? '';

  // Group models by provider for display
  const providerMap = new Map<number, { name: string; type: string }>();
  for (const m of models) {
    if (!providerMap.has(m.providerId)) {
      providerMap.set(m.providerId, { name: m.providerName, type: m.providerType });
    }
  }

  const filteredModels = selectedProviderId !== null
    ? models.filter((m) => m.providerId === selectedProviderId)
    : [];

  return (
    <div className="space-y-4">
      <FormField label={t('plugin.generateTitle.trigger')}>
        <NativeSelect
          value={trigger}
          onChange={(e) => onSave({ ...config, trigger: e.target.value })}
        >
          <option value="first_message">{t('plugin.generateTitle.afterFirst')}</option>
          <option value="every_message">{t('plugin.generateTitle.afterEvery')}</option>
          <option value="disabled">{t('plugin.generateTitle.off')}</option>
        </NativeSelect>
      </FormField>

      <FormField label={t('plugin.generateTitle.providerModel')} desc={t('plugin.generateTitle.providerModelDesc')}>
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
              <option value="">{t('plugin.generateTitle.followConversation')}</option>
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
              <option value="">{t('plugin.generateTitle.selectModel')}</option>
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
  id: 'generate-title',
  name: i18n.t('plugin.generateTitle.title'),
  description: i18n.t('plugin.generateTitle.desc'),
  icon: 'sparkles',
  defaultConfig: () => ({
    trigger: 'first_message',
    provider_id: null,
    model_id: '',
  }),
  ConfigForm: GenerateTitleConfigForm,
  hooks: { onResponseReceived: generateTitleHook },
});
