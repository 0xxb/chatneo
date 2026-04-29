import { useState, useCallback, useEffect } from 'react';
import { getSettings } from '../lib/dao/settings-dao';
import { listProviders } from '../lib/dao/provider-dao';
import { listFavorites, addFavorite, removeFavorite } from '../lib/dao/model-favorite-dao';
import { safeJsonParse } from '../lib/utils';
import { getBuiltinProviders } from '../components/ProviderForms';
import type { ModelCapabilities } from '../lib/model-capabilities.ts';
import { useTauriEvent } from './useTauriEvent';

export interface ModelItem {
  modelId: string;
  modelName: string;
  providerId: number;
  providerName: string;
  providerType: string;
  providerIcon: string;
  favorited: boolean;
  capabilities?: ModelCapabilities;
}

interface ModelEntry {
  id: string;
  name: string;
  modelId: string;
  capabilities?: ModelCapabilities;
}

function parseModels(configStr: string): ModelEntry[] {
  const config = safeJsonParse<{ models?: ModelEntry[] }>(configStr, {});
  return Array.isArray(config.models) ? config.models.filter(m => m.modelId) : [];
}

export function useModels() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const items: ModelItem[] = [];

    // 1. Load builtin providers from settings (batched)
    const builtins = getBuiltinProviders();
    const builtinKeys = builtins.map((bp) => `builtin_provider:${bp.type}`);
    const builtinSettings = await getSettings(builtinKeys);
    for (const bp of builtins) {
      const value = builtinSettings[`builtin_provider:${bp.type}`];
      if (value) {
        const parsed = parseModels(value);
        for (const m of parsed) {
          items.push({
            modelId: m.modelId,
            modelName: m.name || m.modelId,
            providerId: bp.id,
            providerName: bp.name,
            providerType: bp.type,
            providerIcon: bp.icon,
            favorited: false,
            capabilities: m.capabilities,
          });
        }
      }
    }

    // 2. Load custom providers from DB
    const providerRows = await listProviders();
    for (const p of providerRows) {
      const parsed = parseModels(p.config);
      for (const m of parsed) {
        items.push({
          modelId: m.modelId,
          modelName: m.name || m.modelId,
          providerId: p.id,
          providerName: p.name,
          providerType: p.type,
          providerIcon: p.icon,
          favorited: false,
          capabilities: m.capabilities,
        });
      }
    }

    // 3. Load favorites and merge
    const favorites = await listFavorites();
    const favSet = new Set(favorites.map((f) => `${f.provider_id}:${f.model_id}`));

    setModels(items.map((m) => ({
      ...m,
      favorited: favSet.has(`${m.providerId}:${m.modelId}`),
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useTauriEvent('providers-changed', () => { load(); });
  useTauriEvent<{ key: string }>('settings-changed', ({ payload }) => {
    if (payload.key?.startsWith('builtin_provider:')) load();
  });

  const toggleFavorite = useCallback(async (providerId: number, modelId: string) => {
    const wasFavorited = models.find(
      (m) => m.providerId === providerId && m.modelId === modelId,
    )?.favorited ?? false;

    if (wasFavorited) {
      await removeFavorite(modelId, providerId);
    } else {
      await addFavorite(modelId, providerId);
    }

    setModels((prev) =>
      prev.map((m) =>
        m.providerId === providerId && m.modelId === modelId
          ? { ...m, favorited: !wasFavorited }
          : m,
      ),
    );
  }, [models]);

  return { models, loading, reload: load, toggleFavorite };
}
