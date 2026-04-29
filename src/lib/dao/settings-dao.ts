import { getDb } from '../db';

export async function getSetting(key: string): Promise<string | undefined> {
  const db = await getDb();
  const [row] = await db.select<{ value: string }[]>(
    'SELECT value FROM settings WHERE key = $1', [key],
  );
  return row?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
    [key, value],
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const db = await getDb();
  const ph = keys.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await db.select<{ key: string; value: string }[]>(
    `SELECT key, value FROM settings WHERE key IN (${ph})`,
    keys,
  );
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}
