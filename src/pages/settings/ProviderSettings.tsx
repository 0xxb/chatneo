import { useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../components/Settings/FormField';
import { NativeInput } from '../../components/ui/native';
import IconPicker from '../../components/Settings/IconPicker';
import { getProviderForm, getBuiltinProviders } from '../../components/ProviderForms';
import { useSettings } from '../../hooks/useSettings';
import { safeJsonParse } from '../../lib/utils';
import type { OutletContextType } from './ModelSettings';

const builtinProviders = getBuiltinProviders();

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center h-full text-[13px] text-(--color-label-tertiary)">
      {t('settings.provider.notFound')}
    </div>
  );
}

function BuiltinProviderSettings({ builtinType }: { builtinType: string }) {
  const bp = builtinProviders.find((b) => b.type === builtinType);
  const { settings, setSetting } = useSettings();
  if (!bp) return <NotFound />;

  const settingsKey = `builtin_provider:${builtinType}`;
  const config = safeJsonParse<Record<string, unknown>>(settings[settingsKey] ?? '{}', {});

  const saveConfig = (newConfig: Record<string, unknown>) => {
    setSetting(settingsKey, JSON.stringify(newConfig));
  };

  const TypeForm = getProviderForm(bp.type);

  return (
    <div className="p-4 space-y-4" key={builtinType}>
      {TypeForm && <TypeForm config={config} onSave={saveConfig} />}
    </div>
  );
}

function DbProviderSettings({ numericId }: { numericId: number }) {
  const { t } = useTranslation();
  const { providers, updateProvider } = useOutletContext<OutletContextType>();
  const provider = providers.find((p) => p.id === numericId);
  const [name, setName] = useState<string | null>(null);
  if (!provider) return <NotFound />;

  const config = safeJsonParse<Record<string, unknown>>(provider.config, {});

  const saveConfig = (newConfig: Record<string, unknown>) => {
    updateProvider(provider.id, 'config', JSON.stringify(newConfig));
  };

  const nameValue = name ?? provider.name;
  const TypeForm = getProviderForm(provider.type);

  return (
    <div className="p-4 space-y-4" key={provider.id}>
      <div className="flex items-end gap-3">
        <FormField label={t('settings.provider.icon')}>
          <IconPicker
            value={provider.icon}
            onChange={(icon) => updateProvider(provider.id, 'icon', icon)}
          />
        </FormField>
        <div className="flex-1">
          <FormField label={t('common.name')}>
            <NativeInput
              value={nameValue}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name !== null && name.trim()) {
                  updateProvider(provider.id, 'name', name.trim());
                  setName(null);
                } else {
                  setName(null);
                }
              }}
            />
          </FormField>
        </div>
      </div>

      {TypeForm && <TypeForm config={config} onSave={saveConfig} />}
    </div>
  );
}

export default function ProviderSettings() {
  const { providerId } = useParams<{ providerId: string }>();

  if (providerId?.startsWith('builtin_')) {
    const builtinType = providerId.slice('builtin_'.length);
    return <BuiltinProviderSettings key={builtinType} builtinType={builtinType} />;
  }

  const numericId = providerId ? Number(providerId) : undefined;
  if (numericId === undefined || Number.isNaN(numericId)) return <NotFound />;

  return <DbProviderSettings key={numericId} numericId={numericId} />;
}
