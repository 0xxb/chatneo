import { getDb } from '../db';

export interface ToolRow {
  id: string;
  enabled: number;
  config: string;
}

export async function listTools(): Promise<ToolRow[]> {
  const db = await getDb();
  return db.select<ToolRow[]>('SELECT * FROM tools');
}

export async function upsertTool(id: string, enabled: number, config: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO tools (id, enabled, config) VALUES ($1, $2, $3)
     ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled`,
    [id, enabled, config],
  );
}

export async function updateToolConfig(id: string, defaultEnabled: number, config: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO tools (id, enabled, config) VALUES ($1, $2, $3)
     ON CONFLICT(id) DO UPDATE SET config = excluded.config`,
    [id, defaultEnabled, config],
  );
}

export async function getToolConfig(id: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.select<ToolRow[]>('SELECT id, enabled, config FROM tools WHERE id = $1', [id]);
  return row?.config ?? null;
}
