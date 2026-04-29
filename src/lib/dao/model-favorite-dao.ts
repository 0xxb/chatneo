import { getDb } from '../db';
import { nowUnix } from '../utils';

export async function listFavorites(): Promise<{ model_id: string; provider_id: number }[]> {
  const db = await getDb();
  return db.select<{ model_id: string; provider_id: number }[]>('SELECT * FROM model_favorites');
}

export async function addFavorite(modelId: string, providerId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO model_favorites (model_id, provider_id, created_at) VALUES ($1, $2, $3)',
    [modelId, providerId, nowUnix()],
  );
}

export async function removeFavorite(modelId: string, providerId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    'DELETE FROM model_favorites WHERE model_id = $1 AND provider_id = $2',
    [modelId, providerId],
  );
}
