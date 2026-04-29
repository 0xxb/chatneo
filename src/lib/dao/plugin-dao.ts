import { getDb } from '../db';

export interface PluginRow {
  id: string;
  enabled: number;
  config: string;
}

export async function listPlugins(): Promise<PluginRow[]> {
  const db = await getDb();
  return db.select<PluginRow[]>('SELECT * FROM plugins');
}

export async function upsertPlugin(id: string, enabled: number, config: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO plugins (id, enabled, config) VALUES ($1, $2, $3)
     ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled`,
    [id, enabled, config],
  );
}

export async function updatePluginConfig(id: string, config: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO plugins (id, enabled, config) VALUES ($1, 1, $2)
     ON CONFLICT(id) DO UPDATE SET config = excluded.config`,
    [id, config],
  );
}

export async function isPluginEnabled(id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<PluginRow[]>('SELECT id, enabled FROM plugins WHERE id = $1', [id]);
  return rows.length === 0 || rows[0].enabled === 1;
}

export async function getPluginById(id: string): Promise<PluginRow | null> {
  const db = await getDb();
  const [row] = await db.select<PluginRow[]>('SELECT id, enabled, config FROM plugins WHERE id = $1', [id]);
  return row ?? null;
}

export async function getPluginConfig(id: string): Promise<string | null> {
  const row = await getPluginById(id);
  return row?.config ?? null;
}
