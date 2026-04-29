import { useState, useEffect, useCallback } from 'react';
import { emit } from '@tauri-apps/api/event';
import { getAllMcpServers, saveMcpServer, deleteMcpServer as dbDeleteMcpServer } from '../lib/mcp-db';
import type { McpServerConfig } from '../lib/mcp-db';
import { mcpManager, type McpConnectionStatus } from '../lib/mcp-manager';
import { nowUnix } from '../lib/utils';
import { useTauriEvent } from './useTauriEvent';

const EVENT_NAME = 'mcp-servers-changed';

export interface McpServerState extends McpServerConfig {
  connectionStatus: McpConnectionStatus;
  toolCount: number;
}

export function useMcpServers() {
  const [servers, setServers] = useState<McpServerState[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const configs = await getAllMcpServers();
    const snapshot = mcpManager.getSnapshot();
    const merged: McpServerState[] = configs.map((c) => {
      const info = snapshot.get(c.id);
      return {
        ...c,
        connectionStatus: info?.status ?? 'disconnected',
        toolCount: info?.toolCount ?? 0,
      };
    });
    setServers(merged);
  }, []);

  useEffect(() => {
    let mounted = true;
    reload().then(() => { if (mounted) setLoading(false); });
    const unsubMcp = mcpManager.subscribe(() => reload());
    return () => {
      mounted = false;
      unsubMcp();
    };
  }, [reload]);

  useTauriEvent(EVENT_NAME, () => { reload(); });

  const saveServer = useCallback(async (config: McpServerConfig) => {
    await saveMcpServer(config);
    await reload();
    emit(EVENT_NAME);
  }, [reload]);

  const deleteServer = useCallback(async (id: string) => {
    await mcpManager.disconnect(id);
    await dbDeleteMcpServer(id);
    await reload();
    emit(EVENT_NAME);
  }, [reload]);

  const setEnabled = useCallback(async (id: string, enabled: boolean) => {
    const config = servers.find((c) => c.id === id);
    if (!config) return;
    const updated = { ...config, enabled, updated_at: nowUnix() };
    await saveMcpServer(updated);
    if (enabled) {
      mcpManager.connect(updated).catch(() => {});
    } else {
      await mcpManager.disconnect(id);
    }
    await reload();
    emit(EVENT_NAME);
  }, [reload, servers]);

  const connectServer = useCallback(async (config: McpServerConfig) => {
    await mcpManager.connect(config);
    await reload();
  }, [reload]);

  const disconnectServer = useCallback(async (id: string) => {
    await mcpManager.disconnect(id);
    await reload();
  }, [reload]);

  return { servers, loading, saveServer, deleteServer, setEnabled, connectServer, disconnectServer };
}
