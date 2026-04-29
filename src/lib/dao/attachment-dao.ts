import { getDb } from '../db';

export interface AttachmentRow {
  id: string;
  message_id: string;
  type: string;
  name: string;
  path: string;
}

export async function getAttachmentsByConversation(conversationId: string): Promise<AttachmentRow[]> {
  const db = await getDb();
  return db.select<AttachmentRow[]>(
    'SELECT id, message_id, type, name, path FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = $1) ORDER BY sort_order ASC',
    [conversationId],
  );
}

export async function insertAttachment(
  id: string, messageId: string, type: string, name: string, path: string, sortOrder: number, createdAt: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, messageId, type, name, path, sortOrder, createdAt],
  );
}

export async function getSharedPaths(paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const db = await getDb();
  const ph = paths.map((_, i) => `$${i + 1}`).join(',');
  const rows = await db.select<{ path: string }[]>(
    `SELECT DISTINCT path FROM attachments WHERE path IN (${ph})`,
    paths,
  );
  return new Set(rows.map((r) => r.path));
}
