import { getDb } from '../db';
import { nowUnix } from '../utils';

export interface PromptDbRow {
  id: string;
  title: string;
  content: string;
  variables: string;
  category: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export async function listPrompts(): Promise<PromptDbRow[]> {
  const db = await getDb();
  return db.select<PromptDbRow[]>('SELECT * FROM prompts ORDER BY sort_order ASC, created_at ASC');
}

export async function insertPrompt(id: string, title: string, category: string): Promise<void> {
  const db = await getDb();
  const now = nowUnix();
  await db.execute(
    'INSERT INTO prompts (id, title, content, variables, category, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, title, '', '[]', category, now, now],
  );
}

type PromptField = 'title' | 'content' | 'variables' | 'category';
const ALLOWED_FIELDS = new Set<PromptField>(['title', 'content', 'variables', 'category']);

export async function updatePromptField(id: string, field: PromptField, value: string): Promise<void> {
  if (!ALLOWED_FIELDS.has(field)) throw new Error(`不允许更新的字段: ${field}`);
  const db = await getDb();
  const now = nowUnix();
  await db.execute(`UPDATE prompts SET ${field} = $1, updated_at = $2 WHERE id = $3`, [value, now, id]);
}

export async function deletePrompt(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM prompts WHERE id = $1', [id]);
}
