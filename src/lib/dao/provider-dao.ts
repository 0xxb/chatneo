import { getDb } from '../db';

export interface ProviderRow {
  id: number;
  type: string;
  icon: string;
  name: string;
  config: string;
  sort_order: number;
}

export async function listProviders(): Promise<ProviderRow[]> {
  const db = await getDb();
  return db.select<ProviderRow[]>('SELECT * FROM providers ORDER BY sort_order, id');
}

export async function insertProvider(type: string, icon: string, name: string, config: string): Promise<number> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO providers (type, icon, name, config) VALUES ($1, $2, $3, $4)',
    [type, icon, name, config],
  );
  const [row] = await db.select<{ id: number }[]>('SELECT id FROM providers ORDER BY id DESC LIMIT 1');
  return row.id;
}

export async function deleteProvider(id: number): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.execute('UPDATE conversations SET provider_id = NULL WHERE provider_id = $1', [id]),
    db.execute('DELETE FROM model_favorites WHERE provider_id = $1', [id]),
    db.execute('UPDATE knowledge_bases SET embedding_provider_id = NULL WHERE embedding_provider_id = $1', [id]),
  ]);
  await db.execute('DELETE FROM providers WHERE id = $1', [id]);
}

type ProviderField = 'name' | 'icon' | 'config' | 'sort_order';
const ALLOWED_FIELDS = new Set<ProviderField>(['name', 'icon', 'config', 'sort_order']);

export async function updateProviderField(id: number, field: ProviderField, value: string | number | null): Promise<void> {
  if (!ALLOWED_FIELDS.has(field)) throw new Error(`不允许更新的字段: ${field}`);
  const db = await getDb();
  await db.execute(`UPDATE providers SET ${field} = $1 WHERE id = $2`, [value, id]);
}

export async function getProviderById(id: number): Promise<ProviderRow | null> {
  const db = await getDb();
  const [row] = await db.select<ProviderRow[]>('SELECT * FROM providers WHERE id = $1', [id]);
  return row ?? null;
}

export async function getProviderConfig(id: number): Promise<Pick<ProviderRow, 'id' | 'type' | 'config'> | null> {
  const db = await getDb();
  const [row] = await db.select<Pick<ProviderRow, 'id' | 'type' | 'config'>[]>(
    'SELECT id, type, config FROM providers WHERE id = $1', [id],
  );
  return row ?? null;
}
