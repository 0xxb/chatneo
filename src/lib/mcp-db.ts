import { getDb } from './db';
import { safeJsonParse } from './utils';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  enabled: boolean;
  command?: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  headers: Record<string, string>;
  created_at: number;
  updated_at: number;
}

interface McpServerRow {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  enabled: number;
  command: string | null;
  args: string;
  env: string;
  url: string | null;
  headers: string;
  created_at: number;
  updated_at: number;
}

function rowToConfig(row: McpServerRow): McpServerConfig {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    enabled: row.enabled === 1,
    command: row.command ?? undefined,
    args: safeJsonParse<string[]>(row.args, []),
    env: safeJsonParse<Record<string, string>>(row.env, {}),
    url: row.url ?? undefined,
    headers: safeJsonParse<Record<string, string>>(row.headers, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getAllMcpServers(): Promise<McpServerConfig[]> {
  const db = await getDb();
  const rows = await db.select<McpServerRow[]>('SELECT * FROM mcp_servers ORDER BY created_at ASC');
  return rows.map(rowToConfig);
}

export async function getMcpServer(id: string): Promise<McpServerConfig | null> {
  const db = await getDb();
  const rows = await db.select<McpServerRow[]>('SELECT * FROM mcp_servers WHERE id = $1', [id]);
  return rows.length > 0 ? rowToConfig(rows[0]) : null;
}

export async function saveMcpServer(config: McpServerConfig): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO mcp_servers (id, name, transport, enabled, command, args, env, url, headers, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       transport = excluded.transport,
       enabled = excluded.enabled,
       command = excluded.command,
       args = excluded.args,
       env = excluded.env,
       url = excluded.url,
       headers = excluded.headers,
       updated_at = excluded.updated_at`,
    [
      config.id,
      config.name,
      config.transport,
      config.enabled ? 1 : 0,
      config.command ?? null,
      JSON.stringify(config.args),
      JSON.stringify(config.env),
      config.url ?? null,
      JSON.stringify(config.headers),
      config.created_at,
      config.updated_at,
    ],
  );
}

export async function deleteMcpServer(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM mcp_servers WHERE id = $1', [id]);
}
