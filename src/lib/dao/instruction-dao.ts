import { getDb } from '../db';
import { nowUnix } from '../utils';

export interface InstructionRow {
  id: string;
  title: string;
  content: string;
  enabled: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export async function listInstructions(): Promise<InstructionRow[]> {
  const db = await getDb();
  return db.select<InstructionRow[]>(
    'SELECT * FROM instructions ORDER BY sort_order ASC, created_at ASC',
  );
}

export async function insertInstruction(id: string, title: string, content: string): Promise<void> {
  const db = await getDb();
  const now = nowUnix();
  await db.execute(
    'INSERT INTO instructions (id, title, content, enabled, sort_order, created_at, updated_at) VALUES ($1, $2, $3, 1, 0, $4, $5)',
    [id, title, content, now, now],
  );
}

const ALLOWED_FIELDS = new Set(['title', 'content', 'enabled', 'sort_order']);

export async function updateInstruction(
  id: string,
  updates: Partial<Record<'title' | 'content' | 'enabled' | 'sort_order', string | number>>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED_FIELDS.has(key)) throw new Error(`不允许更新的字段: ${key}`);
    sets.push(`${key} = $${idx}`);
    params.push(value);
    idx++;
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = $${idx}`);
  params.push(nowUnix());
  idx++;
  params.push(id);

  await db.execute(
    `UPDATE instructions SET ${sets.join(', ')} WHERE id = $${idx}`,
    params,
  );
}

export async function deleteInstruction(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM instructions WHERE id = $1', [id]);
}

export async function getEnabledInstructions(): Promise<InstructionRow[]> {
  const db = await getDb();
  return db.select<InstructionRow[]>(
    'SELECT * FROM instructions WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC',
  );
}

export async function getConversationInstructions(conversationId: string): Promise<InstructionRow[]> {
  const db = await getDb();
  return db.select<InstructionRow[]>(
    `SELECT i.* FROM instructions i
     INNER JOIN conversation_instructions ci ON ci.instruction_id = i.id
     WHERE ci.conversation_id = $1 AND i.enabled = 1
     ORDER BY i.sort_order ASC, i.created_at ASC`,
    [conversationId],
  );
}

export async function setConversationInstructions(conversationId: string, instructionIds: string[]): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM conversation_instructions WHERE conversation_id = $1', [conversationId]);
  for (const instrId of instructionIds) {
    await db.execute(
      'INSERT INTO conversation_instructions (conversation_id, instruction_id) VALUES ($1, $2)',
      [conversationId, instrId],
    );
  }
}

export async function getConversationInstructionIds(conversationId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ instruction_id: string }[]>(
    'SELECT instruction_id FROM conversation_instructions WHERE conversation_id = $1',
    [conversationId],
  );
  return rows.map((r) => r.instruction_id);
}
