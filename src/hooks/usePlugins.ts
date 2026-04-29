import { useState, useEffect, useCallback } from 'react';
import { emit } from '@tauri-apps/api/event';
import { listPlugins, upsertPlugin, updatePluginConfig } from '../lib/dao/plugin-dao';
import { safeJsonParse } from '../lib/utils';
import { getAllPlugins } from '../lib/plugin-registry';
import { useTauriEvent } from './useTauriEvent';

export interface PluginState {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export function usePlugins() {
  const [plugins, setPlugins] = useState<PluginState[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const rows = await listPlugins();
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const definitions = getAllPlugins();

    const merged: PluginState[] = definitions.map((def) => {
      const row = rowMap.get(def.id);
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        enabled: row ? row.enabled === 1 : true,
        config: row ? safeJsonParse<Record<string, unknown>>(row.config, def.defaultConfig()) : def.defaultConfig(),
      };
    });
    setPlugins(merged);
  }, []);

  useEffect(() => {
    let mounted = true;
    reload().then(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [reload]);

  useTauriEvent('plugins-changed', () => { reload(); });

  const setPluginEnabled = useCallback(async (id: string, enabled: boolean) => {
    const def = getAllPlugins().find((p) => p.id === id);
    await upsertPlugin(id, enabled ? 1 : 0, JSON.stringify(def?.defaultConfig() ?? {}));
    await reload();
    emit('plugins-changed');
  }, [reload]);

  const setPluginConfig = useCallback(async (id: string, config: Record<string, unknown>) => {
    await updatePluginConfig(id, JSON.stringify(config));
    await reload();
    emit('plugins-changed');
  }, [reload]);

  return { plugins, loading, setPluginEnabled, setPluginConfig };
}
