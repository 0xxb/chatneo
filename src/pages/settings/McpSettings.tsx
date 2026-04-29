import { useEffect, useCallback } from 'react';
import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { ask } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import SubLayout from '../../components/Settings/SubLayout';
import SubNavActions from '../../components/Settings/SubNavActions';
import { useMcpServers } from '../../hooks/useMcpServers';
import { NativeSwitch } from '../../components/ui/native';
import { useContextMenu } from '../../hooks/useContextMenu';
import { nowUnix } from '../../lib/utils';
import type { MenuDef } from '../../hooks/useContextMenu';
import type { SubMenuItem } from '../../components/Settings/SubLayout';

export default function McpSettings() {
  const { t } = useTranslation();
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const { servers, setEnabled, deleteServer, saveServer } = useMcpServers();

  const addMenuDef: MenuDef = [
    { type: 'item', id: 'stdio', text: t('settings.mcpServer.stdio') },
  ];

  const handleAdd = useCallback(async (transport: string) => {
    const id = crypto.randomUUID();
    // 新建/编辑/启停必须用同一时间精度（秒），否则首次添加的行和之后的更新时间不可比。
    const now = nowUnix();
    await saveServer({
      id,
      name: t('settings.mcpServer.unnamed'),
      transport: transport as 'stdio' | 'sse',
      enabled: true,
      command: undefined,
      args: [],
      env: {},
      url: undefined,
      headers: {},
      created_at: now,
      updated_at: now,
    });
    navigate(`/mcp/${id}`);
  }, [navigate, saveServer]);

  const showAddMenu = useContextMenu(addMenuDef, (id) => handleAdd(id));

  const deleteById = useCallback(async (id: string) => {
    const target = servers.find((s) => s.id === id);
    if (!target) return;
    const confirmed = await ask(t('settings.mcpServer.deleteConfirm', { name: target.name }), {
      title: t('settings.mcpServer.deleteTitle'),
      kind: 'warning',
      okLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    await deleteServer(id);
    const remaining = servers.filter((s) => s.id !== id);
    navigate(
      remaining.length > 0 ? `/mcp/${remaining[0].id}` : '/mcp',
      { replace: true },
    );
  }, [servers, deleteServer, navigate, t]);

  const handleDelete = useCallback(async () => {
    if (serverId) deleteById(serverId);
  }, [serverId, deleteById]);

  const showItemMenu = useContextMenu<string>(
    (ctx) => {
      const s = servers.find((s) => s.id === ctx);
      return [
        { type: 'item', id: 'toggle', text: s?.enabled ? t('common.disable') : t('common.enable') },
        { type: 'separator' },
        { type: 'item', id: 'delete', text: t('common.delete') },
      ];
    },
    (action, id) => {
      if (action === 'toggle') {
        const s = servers.find((s) => s.id === id);
        if (s) setEnabled(id, !s.enabled);
      } else if (action === 'delete') {
        deleteById(id);
      }
    },
  );

  const items: SubMenuItem[] = servers.map((s) => ({
    id: s.id,
    path: `/mcp/${s.id}`,
    label: s.name,
    onContextMenu: (e: React.MouseEvent) => showItemMenu(e, s.id),
    icon: (
      <span
        className={`w-2 h-2 rounded-full inline-block ${
          s.connectionStatus === 'connected'
            ? 'bg-green-500'
            : s.connectionStatus === 'connecting'
              ? 'bg-yellow-500'
              : s.connectionStatus === 'error'
                ? 'bg-red-500'
                : 'bg-gray-400'
        }`}
      />
    ),
  }));

  useEffect(() => {
    if (!serverId && servers.length > 0) {
      navigate(`/mcp/${servers[0].id}`, { replace: true });
    }
  }, [serverId, servers, navigate]);

  const current = servers.find((s) => s.id === serverId);

  return (
    <SubLayout
      items={items}
      title={current?.name ?? 'MCP'}
      emptyText={t('settings.mcpServer.empty')}
      titleExtra={
        serverId && current ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-(--color-label-tertiary)">
              {current.enabled ? t('common.enabled') : t('common.disabled')}
            </span>
            <NativeSwitch
              checked={current.enabled}
              onChange={(e) => setEnabled(serverId, e.target.checked)}
            />
          </div>
        ) : undefined
      }
      footer={
        <SubNavActions
          onAdd={(e) => showAddMenu(e, undefined as void)}
          onDelete={handleDelete}
          deleteDisabled={!serverId}
        />
      }
    >
      <Outlet />
    </SubLayout>
  );
}
