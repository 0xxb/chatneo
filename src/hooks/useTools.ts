import { useState, useEffect, useCallback } from 'react';
import { emit } from '@tauri-apps/api/event';
import { listTools, upsertTool, updateToolConfig } from '../lib/dao/tool-dao';
import { safeJsonParse } from '../lib/utils';
import { getAllTools } from '../lib/tool-registry';
import { useTauriEvent } from './useTauriEvent';

export interface ToolState {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export function useTools() {
  const [tools, setTools] = useState<ToolState[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const rows = await listTools();
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const definitions = getAllTools();

    const merged: ToolState[] = definitions.map((def) => {
      const row = rowMap.get(def.id);
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        enabled: row ? row.enabled === 1 : def.enabledByDefault,
        config: row
          ? safeJsonParse<Record<string, unknown>>(row.config, def.defaultConfig())
          : def.defaultConfig(),
      };
    });
    setTools(merged);
  }, []);

  useEffect(() => {
    let mounted = true;
    reload().then(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [reload]);

  useTauriEvent('tools-changed', () => { reload(); });

  const setToolEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      const def = getAllTools().find((t) => t.id === id);
      await upsertTool(id, enabled ? 1 : 0, JSON.stringify(def?.defaultConfig() ?? {}));
      await reload();
      emit('tools-changed');
    },
    [reload],
  );

  const setToolConfig = useCallback(
    async (id: string, config: Record<string, unknown>) => {
      const def = getAllTools().find((t) => t.id === id);
      const defaultEnabled = def?.enabledByDefault ? 1 : 0;
      await updateToolConfig(id, defaultEnabled, JSON.stringify(config));
      await reload();
      emit('tools-changed');
    },
    [reload],
  );

  return { tools, loading, setToolEnabled, setToolConfig };
}
