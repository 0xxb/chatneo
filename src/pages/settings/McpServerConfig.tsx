import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMcpServers } from '../../hooks/useMcpServers';
import { NativeInput } from '../../components/ui/native';
import { FormField } from '../../components/Settings/FormField';
import { mcpManager } from '../../lib/mcp-manager';
import type { McpServerConfig as McpServerConfigType } from '../../lib/mcp-db';
import { Plus, Trash2, Plug, Unplug } from 'lucide-react';
import { nowUnix } from '../../lib/utils';

// ── Key-value table row (PromptDetail style) ──

function KvRow({
  kvKey,
  kvValue,
  keyPlaceholder,
  valuePlaceholder,
  onUpdate,
  onDelete,
}: {
  kvKey: string;
  kvValue: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  onUpdate: (key: string, value: string) => void;
  onDelete: () => void;
}) {
  const [k, setK] = useState<string | null>(null);
  const [v, setV] = useState<string | null>(null);

  return (
    <tr className="group border-t border-(--color-separator)/40">
      <td className="py-1 px-2">
        <input
          className="w-full bg-transparent text-(--color-label) text-[13px] outline-none focus:bg-(--color-fill-secondary) rounded px-1 -mx-1 font-mono"
          value={k ?? kvKey}
          placeholder={keyPlaceholder ?? 'Key'}
          onChange={(e) => setK(e.target.value)}
          onBlur={() => {
            if (k !== null && k !== kvKey) {
              onUpdate(k, v ?? kvValue);
            }
            setK(null);
          }}
        />
      </td>
      <td className="py-1 px-2">
        <input
          className="w-full bg-transparent text-(--color-label) text-[13px] outline-none focus:bg-(--color-fill-secondary) rounded px-1 -mx-1 font-mono"
          value={v ?? kvValue}
          placeholder={valuePlaceholder ?? 'Value'}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            if (v !== null && v !== kvValue) {
              onUpdate(k ?? kvKey, v);
            }
            setV(null);
          }}
        />
      </td>
      <td className="py-1 px-2 w-12">
        <div className="flex items-center justify-end">
          <button
            onClick={onDelete}
            className="p-1 rounded text-(--color-label-tertiary) hover:text-(--color-destructive) hover:bg-(--color-fill-secondary) transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function KvTable({
  label,
  data,
  keyHeader,
  valueHeader,
  keyPlaceholder,
  valuePlaceholder,
  onChange,
}: {
  label: string;
  data: Record<string, string>;
  keyHeader: string;
  valueHeader: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  onChange: (data: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<[string, string][]>(() => Object.entries(data));

  useEffect(() => {
    setEntries(Object.entries(data));
  }, [data]);

  const commit = (newEntries: [string, string][]) => {
    setEntries(newEntries);
    const obj: Record<string, string> = {};
    for (const [k, v] of newEntries) {
      if (k) obj[k] = v;
    }
    onChange(obj);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-[13px] text-(--color-label) mr-auto">{label}</span>
        <button
          onClick={() => setEntries([...entries, ['', '']])}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] text-(--color-label-secondary) hover:bg-(--color-fill-secondary) transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('common.add')}
        </button>
      </div>
      {entries.length > 0 ? (
        <div className="border border-(--color-separator) rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-(--color-label-tertiary) text-[12px] bg-(--color-fill-secondary)">
                <th className="py-1.5 px-2 font-normal">{keyHeader}</th>
                <th className="py-1.5 px-2 font-normal">{valueHeader}</th>
                <th className="py-1.5 px-2 font-normal w-12" />
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, value], i) => (
                <KvRow
                  key={i}
                  kvKey={key}
                  kvValue={value}
                  keyPlaceholder={keyPlaceholder}
                  valuePlaceholder={valuePlaceholder}
                  onUpdate={(k, v) => {
                    const next = [...entries];
                    next[i] = [k, v];
                    commit(next);
                  }}
                  onDelete={() => commit(entries.filter((_, j) => j !== i))}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-4 text-center text-[13px] text-(--color-label-tertiary)">
          {t('settings.mcpServer.noEnvVars')}
        </div>
      )}
    </div>
  );
}

// ── Main config page ──

export default function McpServerConfig() {
  const { t } = useTranslation();
  const { serverId } = useParams<{ serverId: string }>();
  const { servers, saveServer, connectServer, disconnectServer } = useMcpServers();

  const server = servers.find((s) => s.id === serverId);

  if (!serverId || !server) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-(--color-label-tertiary)">
        {t('settings.mcpServer.selectOrAdd')}
      </div>
    );
  }

  const saveField = async (patch: Partial<McpServerConfigType>) => {
    const updated = { ...server, ...patch, updated_at: nowUnix() };
    await saveServer(updated);
    // Auto-reconnect if currently connected and config changed
    if (connectionStatus === 'connected') {
      mcpManager.disconnect(server.id).then(() => mcpManager.connect(updated)).catch(() => {});
    }
  };

  const connectionStatus = server.connectionStatus;
  const tools = mcpManager.getServerTools(serverId);
  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  const handleConnect = async () => {
    await connectServer(server);
  };

  const textareaClass = 'w-full resize-none rounded-md border border-(--color-separator) bg-(--color-bg-control) px-2.5 py-2 text-[13px] text-(--color-label) font-mono placeholder:text-(--color-label-tertiary) focus:outline-none focus:border-(--color-accent)';

  return (
    <div className="p-4 space-y-4" key={serverId}>
      <FormField label={t('settings.mcpServer.name')}>
        <NameInput
          value={server.name}
          onSave={(name) => saveField({ name })}
          placeholder={t('settings.mcpServer.namePlaceholder')}
        />
      </FormField>

      {/* Stdio 配置 */}
      {server.transport === 'stdio' && (
        <>
          <FormField label={t('settings.mcpServer.command')} desc={t('settings.mcpServer.commandDesc')}>
            <TextareaField
              value={server.command ?? ''}
              placeholder="npx"
              className={textareaClass}
              rows={1}
              onSave={(v) => saveField({ command: v || undefined })}
            />
          </FormField>
          <FormField label={t('settings.mcpServer.args')} desc={t('settings.mcpServer.argsDesc')}>
            <TextareaField
              value={server.args.join('\n')}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/tmp"}
              className={textareaClass}
              rows={3}
              onSave={(v) => saveField({ args: v.split('\n').map(s => s.trim()).filter(Boolean) })}
            />
          </FormField>
          <KvTable
            label={t('settings.mcpServer.envVars')}
            data={server.env}
            keyHeader={t('settings.mcpServer.envVarName')}
            valueHeader={t('settings.mcpServer.envVarValue')}
            keyPlaceholder="KEY"
            valuePlaceholder="VALUE"
            onChange={(env) => saveField({ env })}
          />
        </>
      )}

      {/* SSE 配置 */}
      {server.transport === 'sse' && (
        <>
          <FormField label="URL">
            <NameInput
              value={server.url ?? ''}
              onSave={(url) => saveField({ url: url || undefined })}
              placeholder="http://localhost:3000/sse"
            />
          </FormField>
          <KvTable
            label="Headers"
            data={server.headers}
            keyHeader="Header"
            valueHeader={t('settings.mcpServer.envVarValue')}
            keyPlaceholder="Authorization"
            valuePlaceholder="Bearer ..."
            onChange={(headers) => saveField({ headers })}
          />
        </>
      )}

      {/* 连接操作 */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <button
            onClick={() => disconnectServer(serverId)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-(--color-label-secondary) hover:text-(--color-label) border border-(--color-separator) hover:bg-(--color-fill-secondary) transition-colors"
          >
            <Unplug className="w-3 h-3" />
            {t('settings.mcpServer.disconnect')}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-(--color-label-secondary) hover:text-(--color-label) border border-(--color-separator) hover:bg-(--color-fill-secondary) transition-colors disabled:opacity-50"
          >
            <Plug className="w-3 h-3" />
            {isConnecting ? t('settings.mcpServer.connecting') : t('settings.mcpServer.connect')}
          </button>
        )}

        {connectionStatus === 'error' && (
          <span className="text-[11px] text-red-500">{t('settings.mcpServer.connectFailed')}</span>
        )}
      </div>

      {/* 已发现的工具 */}
      {tools.length > 0 && (
        <div>
          <label className="text-[13px] text-(--color-label)">
            {t('settings.mcpServer.toolsFound', { count: tools.length })}
          </label>
          <div className="mt-1.5 space-y-0.5">
            {tools.map((t) => (
              <div
                key={t.name}
                className="flex items-baseline gap-2 px-2.5 py-1.5 rounded-md bg-(--color-fill)/50 text-[12px]"
              >
                <span className="font-mono text-(--color-label) shrink-0">{t.name}</span>
                {t.description && (
                  <span className="text-(--color-label-tertiary) truncate">{t.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable field components ──

function NameInput({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState<string | null>(null);
  const display = local ?? value;

  return (
    <NativeInput
      value={display}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== null && local !== value) {
          onSave(local);
        }
        setLocal(null);
      }}
    />
  );
}

function TextareaField({
  value,
  onSave,
  placeholder,
  className,
  rows,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}) {
  const [local, setLocal] = useState<string | null>(null);
  const display = local ?? value;

  return (
    <textarea
      value={display}
      placeholder={placeholder}
      rows={rows}
      className={className}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== null && local !== value) {
          onSave(local);
        }
        setLocal(null);
      }}
    />
  );
}
