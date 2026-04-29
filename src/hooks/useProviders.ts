import { useState, useEffect, useCallback } from 'react';
import { emit } from '@tauri-apps/api/event';
import { listProviders, insertProvider, deleteProvider as daoDeleteProvider, updateProviderField } from '../lib/dao/provider-dao';
import { useTauriEvent } from './useTauriEvent';

export type { ProviderRow } from '../lib/dao/provider-dao';
import type { ProviderRow } from '../lib/dao/provider-dao';

export function useProviders() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const rows = await listProviders();
    setProviders(rows);
    return rows;
  }, []);

  useEffect(() => {
    let mounted = true;
    reload().then(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [reload]);

  useTauriEvent('providers-changed', () => { reload(); });

  const addProvider = useCallback(async (type: string, icon: string, name: string, config?: Record<string, unknown>) => {
    const id = await insertProvider(type, icon, name, JSON.stringify(config ?? {}));
    await reload();
    emit('providers-changed');
    return id;
  }, [reload]);

  const deleteProvider = useCallback(async (id: number) => {
    await daoDeleteProvider(id);
    const rows = await reload();
    emit('providers-changed');
    return rows;
  }, [reload]);

  const updateProvider = useCallback(async (id: number, field: 'name' | 'icon' | 'config' | 'sort_order', value: string | number | null) => {
    await updateProviderField(id, field, value);
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
    emit('providers-changed');
  }, []);

  return { providers, loading, addProvider, deleteProvider, updateProvider };
}
