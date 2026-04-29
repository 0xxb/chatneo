import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ask } from '@tauri-apps/plugin-dialog';
import { FormField } from '../Settings/FormField';
import { NativeInput } from '../ui/native';
import ModelManager from '../ModelManager';
import type { Model } from '../ModelManager';
import { registerProvider } from './registry';
import type { ProviderFormProps } from './registry';
import { canFetchModels, fetchModels } from '../../lib/providers';
import { getDefaultCapabilities } from '../../lib/model-catalog';
import { DEFAULT_BASE_URLS, DEFAULT_BEDROCK_REGION, DEFAULT_VERTEX_LOCATION } from '../../lib/providers/defaults';
export { DEFAULT_BASE_URLS, DEFAULT_BEDROCK_REGION, DEFAULT_VERTEX_LOCATION };

interface ApiKeyFormOptions {
  showApiKey?: boolean;
  showBaseURL?: boolean;
  baseURLRequired?: boolean;
  baseURLLabel?: string;
  defaultBaseURL?: string;
  /** Extra fields rendered between baseURL and ModelManager */
  extraFields?: ExtraField[];
}

interface ExtraField {
  key: string;
  label: string;
  placeholder: string;
  desc?: string;
  secret?: boolean;
}

function createApiKeyForm(providerType: string, options: ApiKeyFormOptions = {}) {
  const {
    showApiKey = true,
    showBaseURL = true,
    baseURLRequired = false,
    baseURLLabel = '',
    defaultBaseURL = DEFAULT_BASE_URLS[providerType],
    extraFields,
  } = options;

  const supportsFetch = canFetchModels(providerType);

  function ApiKeyForm({ config, onSave }: ProviderFormProps) {
    const { t } = useTranslation();
    const apiKey = (config.apiKey as string) || '';
    const baseURL = (config.baseURL as string) || '';
    const models = (config.models as Model[]) || [];

    const [keyDraft, setKeyDraft] = useState(apiKey);
    const [urlDraft, setUrlDraft] = useState(baseURL || defaultBaseURL || '');
    const [extraDrafts, setExtraDrafts] = useState<Record<string, string>>({});
    const [fetchingModels, setFetchingModels] = useState(false);
    const [fetchError, setFetchError] = useState('');

    // Sync drafts when config loads asynchronously
    useEffect(() => { setKeyDraft(apiKey); }, [apiKey]);
    useEffect(() => { setUrlDraft(baseURL || defaultBaseURL || ''); }, [baseURL]);

    const configRef = useRef(config);
    configRef.current = config;
    const save = useCallback((patch: Partial<typeof config>) => {
      onSave({ ...configRef.current, ...patch });
    }, [onSave]);

    // Save pending changes on unmount (safety net for navigation without blur)
    type PendingState = { keyDraft: string; urlDraft: string; extraDrafts: Record<string, string>; apiKey: string; baseURL: string; config: Record<string, unknown> };
    const pendingRef = useRef<PendingState>({ keyDraft, urlDraft, extraDrafts, apiKey, baseURL, config });
    pendingRef.current = { keyDraft, urlDraft, extraDrafts, apiKey, baseURL, config };
    useEffect(() => {
      return () => {
        const { keyDraft: k, urlDraft: u, extraDrafts: ed, apiKey: ak, baseURL: bu, config: cfg } = pendingRef.current!;
        const patch: Record<string, unknown> = {};
        if (k !== ak) patch.apiKey = k;
        if (u !== (bu || defaultBaseURL || '')) patch.baseURL = u;
        if (extraFields) {
          for (const field of extraFields) {
            const draft = ed[field.key];
            if (draft !== undefined && draft !== ((cfg[field.key] as string) || '')) {
              patch[field.key] = draft;
            }
          }
        }
        if (Object.keys(patch).length > 0) {
          onSave({ ...cfg, ...patch });
        }
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const getExtra = (key: string) => (config[key] as string) || '';

    const handleFetchModels = useCallback(async () => {
      if (models.length > 0) {
        const confirmed = await ask(t('settings.provider.fetchModelConfirm'), {
          title: t('settings.provider.fetchModelTitle'),
          kind: 'warning',
        });
        if (!confirmed) return;
      }
      setFetchingModels(true);
      setFetchError('');
      try {
        const effectiveConfig = {
          ...config,
          baseURL: urlDraft || defaultBaseURL || config.baseURL,
          apiKey: keyDraft || config.apiKey,
        };
        const fetched = await fetchModels(providerType, effectiveConfig);

        // Merge: preserve existing user customizations
        const existingMap = new Map(models.map((m) => [m.modelId, m]));
        const fetchedIds = new Set(fetched.map((m) => m.id));
        const merged: Model[] = fetched.map((m) => {
          const existing = existingMap.get(m.id);
          if (existing) {
            return {
              ...existing,
              contextLength: existing.contextLength || m.contextLength,
              maxOutputTokens: existing.maxOutputTokens || m.maxOutputTokens,
            };
          }
          return {
            id: crypto.randomUUID(),
            name: m.name,
            modelId: m.id,
            contextLength: m.contextLength,
            maxOutputTokens: m.maxOutputTokens,
            capabilities: getDefaultCapabilities(m.id),
          };
        });
        // Append user-added models not in fetched list
        for (const m of models) {
          if (!fetchedIds.has(m.modelId)) {
            merged.push(m);
          }
        }
        save({ models: merged });
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : t('settings.provider.fetchFailed'));
      } finally {
        setFetchingModels(false);
      }
    }, [config, urlDraft, keyDraft, models, save]);

    return (
      <div className="space-y-4">
        {showApiKey && (
          <FormField label="API Key">
            <NativeInput
              className="font-mono"
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onBlur={() => { if (keyDraft !== apiKey) save({ apiKey: keyDraft }); }}
              placeholder={t('settings.provider.apiKeyPlaceholder')}
            />
          </FormField>
        )}

        {showBaseURL && (
          <FormField label={baseURLLabel || t('settings.provider.baseUrl')} desc={baseURLRequired ? t('settings.provider.baseUrlRequired') : undefined}>
            <NativeInput
              className="font-mono"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={() => { if (urlDraft !== baseURL) save({ baseURL: urlDraft }); }}
              placeholder={defaultBaseURL || t('settings.provider.baseUrlPlaceholder')}
            />
          </FormField>
        )}

        {extraFields?.map((field) => {
          const current = getExtra(field.key);
          const draft = extraDrafts[field.key];
          const resolvedPlaceholder = field.placeholder.startsWith('settings.') ? t(field.placeholder) : field.placeholder;
          const resolvedDesc = field.desc ? (field.desc.startsWith('settings.') ? t(field.desc) : field.desc) : undefined;
          return (
            <FormField key={field.key} label={field.label} desc={resolvedDesc}>
              <NativeInput
                className="font-mono"
                type={field.secret ? 'password' : undefined}
                value={draft ?? current}
                onChange={(e) => setExtraDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))}
                onBlur={() => {
                  const val = draft ?? current;
                  if (val !== current) save({ [field.key]: val });
                  setExtraDrafts((prev) => { const next = { ...prev }; delete next[field.key]; return next; });
                }}
                placeholder={resolvedPlaceholder}
              />
            </FormField>
          );
        })}

        {fetchError && (
          <div className="text-[12px] text-(--color-destructive)">{fetchError}</div>
        )}

        <ModelManager
          title={t('settings.provider.modelList')}
          value={models}
          onChange={(newModels) => save({ models: newModels })}
          onFetchModels={supportsFetch ? handleFetchModels : undefined}
          isFetchingModels={fetchingModels}
        />
      </div>
    );
  }

  return ApiKeyForm;
}

// --- Register all API-key-based providers ---

// Builtin providers
registerProvider('openai', createApiKeyForm('openai'), () => ({ apiKey: '', models: [] }));
registerProvider('anthropic', createApiKeyForm('anthropic'), () => ({ apiKey: '', models: [] }));
registerProvider('google', createApiKeyForm('google'), () => ({ apiKey: '', models: [] }));
registerProvider('azure-openai', createApiKeyForm('azure-openai', {
  baseURLLabel: 'Endpoint URL',
  defaultBaseURL: undefined,
  extraFields: [
    { key: 'resourceName', label: 'Resource Name', placeholder: 'settings.provider.azureResourceName', desc: 'settings.provider.azureResourceNameAlt' },
    { key: 'apiVersion', label: 'API Version', placeholder: 'settings.provider.azureApiVersion' },
  ],
}), () => ({ apiKey: '', baseURL: '', models: [] }));
registerProvider('deepseek', createApiKeyForm('deepseek'), () => ({ apiKey: '', models: [] }));
registerProvider('groq', createApiKeyForm('groq'), () => ({ apiKey: '', models: [] }));
registerProvider('perplexity', createApiKeyForm('perplexity'), () => ({ apiKey: '', models: [] }));
registerProvider('openrouter', createApiKeyForm('openrouter'), () => ({ apiKey: '', models: [] }));
registerProvider('ollama', createApiKeyForm('ollama', {
  showApiKey: false,
  defaultBaseURL: 'http://localhost:11434',
}), () => ({ baseURL: 'http://localhost:11434', models: [] }));

// Addable providers — Group 0
registerProvider('mistral', createApiKeyForm('mistral'), () => ({ apiKey: '', models: [] }));
registerProvider('xai', createApiKeyForm('xai'), () => ({ apiKey: '', models: [] }));
registerProvider('openai-compatible', createApiKeyForm('openai-compatible', {
  baseURLRequired: true,
  defaultBaseURL: undefined,
}), () => ({ apiKey: '', baseURL: '', models: [] }));

// Addable providers — Group 1 (Chinese)
registerProvider('aliyun', createApiKeyForm('aliyun'), () => ({ apiKey: '', models: [] }));
registerProvider('siliconflow', createApiKeyForm('siliconflow'), () => ({ apiKey: '', models: [] }));
registerProvider('kimi', createApiKeyForm('kimi'), () => ({ apiKey: '', models: [] }));
registerProvider('zhipu', createApiKeyForm('zhipu'), () => ({ apiKey: '', models: [] }));
registerProvider('volcengine', createApiKeyForm('volcengine'), () => ({ apiKey: '', models: [] }));
registerProvider('minimax', createApiKeyForm('minimax'), () => ({ apiKey: '', models: [] }));

// Addable providers — Group 2 (Inference platforms)
registerProvider('togetherai', createApiKeyForm('togetherai'), () => ({ apiKey: '', models: [] }));
registerProvider('fireworks', createApiKeyForm('fireworks'), () => ({ apiKey: '', models: [] }));
registerProvider('cerebras', createApiKeyForm('cerebras'), () => ({ apiKey: '', models: [] }));
registerProvider('deepinfra', createApiKeyForm('deepinfra'), () => ({ apiKey: '', models: [] }));
registerProvider('sambanova', createApiKeyForm('sambanova'), () => ({ apiKey: '', models: [] }));
registerProvider('cohere', createApiKeyForm('cohere'), () => ({ apiKey: '', models: [] }));

// Addable providers — Group 3 (Aggregators)
registerProvider('302ai', createApiKeyForm('302ai'), () => ({ apiKey: '', models: [] }));
registerProvider('aihubmix', createApiKeyForm('aihubmix'), () => ({ apiKey: '', models: [] }));

// Addable providers — Group 4 (Cloud platforms)
registerProvider('bedrock', createApiKeyForm('bedrock', {
  showApiKey: false,
  showBaseURL: false,
  extraFields: [
    { key: 'region', label: 'Region', placeholder: DEFAULT_BEDROCK_REGION },
    { key: 'accessKeyId', label: 'Access Key ID', placeholder: 'settings.provider.bedrockAccessKeyId', secret: true },
    { key: 'secretAccessKey', label: 'Secret Access Key', placeholder: 'settings.provider.bedrockSecretAccessKey', secret: true },
    { key: 'sessionToken', label: 'Session Token', placeholder: 'settings.provider.bedrockSessionToken', desc: 'settings.provider.bedrockSessionTokenDesc', secret: true },
  ],
}), () => ({ region: DEFAULT_BEDROCK_REGION, accessKeyId: '', secretAccessKey: '', models: [] }));
registerProvider('vertex', createApiKeyForm('vertex', {
  extraFields: [
    { key: 'project', label: 'Project ID', placeholder: 'settings.provider.vertexProject' },
    { key: 'location', label: 'Location', placeholder: DEFAULT_VERTEX_LOCATION },
  ],
}), () => ({ apiKey: '', project: '', location: DEFAULT_VERTEX_LOCATION, models: [] }));
