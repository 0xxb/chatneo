import { getDb } from '../db';
import type { ConversationRow } from '../../store/chat';

export async function loadConversations(limit = 30, offset = 0): Promise<ConversationRow[]> {
  const db = await getDb();
  return db.select<ConversationRow[]>(
    'SELECT * FROM conversations WHERE archived = 0 ORDER BY pinned DESC, updated_at DESC LIMIT $1 OFFSET $2',
    [limit, offset],
  );
}

export async function searchConversations(keyword: string, limit = 50): Promise<ConversationRow[]> {
  const db = await getDb();
  const escaped = keyword.replace(/[%_]/g, '\\$&');
  return db.select<ConversationRow[]>(
    "SELECT * FROM conversations WHERE archived = 0 AND title LIKE $1 ESCAPE '\\' ORDER BY pinned DESC, updated_at DESC LIMIT $2",
    [`%${escaped}%`, limit],
  );
}

export async function conversationExists(id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>('SELECT id FROM conversations WHERE id = $1 LIMIT 1', [id]);
  return rows.length > 0;
}

export async function insertConversation(id: string, title: string, providerId: number | null, modelId: string, createdAt: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO conversations (id, title, provider_id, model_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, title, providerId, modelId ?? '', createdAt, createdAt],
  );
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM conversations WHERE id = $1', [id]);
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE conversations SET title = $1 WHERE id = $2', [title, id]);
}

export async function updateConversationTimestamp(id: string, updatedAt: number): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE conversations SET updated_at = $1 WHERE id = $2', [updatedAt, id]);
}

export async function updateConversationModel(id: string, providerId: number | null, modelId: string): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE conversations SET provider_id = $1, model_id = $2 WHERE id = $3', [providerId, modelId, id]);
}

export async function updateConversationModelAndTimestamp(id: string, providerId: number | null, modelId: string, updatedAt: number): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE conversations SET updated_at = $1, provider_id = $2, model_id = $3 WHERE id = $4', [updatedAt, providerId, modelId, id]);
}

export async function clearConversationSummary(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE conversations SET summary = '' WHERE id = $1", [id]);
}

export async function toggleConversationPinned(id: string): Promise<number> {
  const db = await getDb();
  await db.execute('UPDATE conversations SET pinned = 1 - pinned WHERE id = $1', [id]);
  const [row] = await db.select<{ pinned: number }[]>('SELECT pinned FROM conversations WHERE id = $1', [id]);
  return row?.pinned ?? 0;
}

export async function toggleConversationArchived(id: string): Promise<number> {
  const db = await getDb();
  await db.execute('UPDATE conversations SET archived = 1 - archived WHERE id = $1', [id]);
  const [row] = await db.select<{ archived: number }[]>('SELECT archived FROM conversations WHERE id = $1', [id]);
  return row?.archived ?? 0;
}

export async function loadArchivedConversations(limit = 100): Promise<ConversationRow[]> {
  const db = await getDb();
  return db.select<ConversationRow[]>(
    'SELECT * FROM conversations WHERE archived = 1 ORDER BY updated_at DESC LIMIT $1',
    [limit],
  );
}

export async function getConversationAttachmentPaths(conversationId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ path: string }[]>(
    'SELECT path FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = $1)',
    [conversationId],
  );
  return rows.map((r) => r.path);
}

export async function getConversationPartStrings(conversationId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ parts: string }[]>(
    'SELECT parts FROM messages WHERE conversation_id = $1',
    [conversationId],
  );
  return rows.map((r) => r.parts);
}
