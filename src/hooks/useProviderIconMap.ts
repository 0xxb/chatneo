import { useState, useEffect, useCallback } from 'react';
import { getDb } from '../lib/db';
import { safeJsonParse } from '../lib/utils';
import { getBuiltinProviders } from '../components/ProviderForms';
import { useTauriEvent } from './useTauriEvent';

/**
 * Provider icon resolver.
 *
 * Returns a function: (providerId, modelId?) → icon name.
 * - DB providers (id > 0): looked up from the providers table.
 * - Builtin providers (id < 0): matched via builtin provider list + settings table model lists.
 */
export function useProviderIconMap() {
  const [iconMap, setIconMap] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    const db = await getDb();
    const map = new Map<string, string>();

    // DB providers: providerId → icon
    const rows = await db.select<{ id: number; icon: string }[]>(
      'SELECT id, icon FROM providers',
    );
    for (const r of rows) map.set(`p:${r.id}`, r.icon);

    // Builtin providers: id → icon, and modelId → icon (via settings)
    const builtins = getBuiltinProviders();
    for (const bp of builtins) map.set(`p:${bp.id}`, bp.icon);

    const settingsRows = await db.select<{ key: string; value: string }[]>(
      "SELECT key, value FROM settings WHERE key LIKE 'builtin_provider:%'",
    );
    const settingsMap = new Map(settingsRows.map((r) => [r.key, r.value]));
    for (const bp of builtins) {
      const raw = settingsMap.get(`builtin_provider:${bp.type}`);
      if (raw) {
        const config = safeJsonParse<{ models?: { modelId: string }[] }>(raw, {});
        for (const m of config.models ?? []) {
          map.set(`m:${m.modelId}`, bp.icon);
        }
      }
    }

    setIconMap(map);
  }, []);

  useEffect(() => { load(); }, [load]);
  useTauriEvent('providers-changed', () => { load(); });
  useTauriEvent('settings-changed', () => { load(); });

  return useCallback(
    (providerId: number | null, modelId?: string | null): string => {
      if (providerId != null) {
        const byId = iconMap.get(`p:${providerId}`);
        if (byId) return byId;
      }
      if (modelId) return iconMap.get(`m:${modelId}`) ?? 'default';
      return 'default';
    },
    [iconMap],
  );
}
