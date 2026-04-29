import { getDb } from '../db';
import type { MessageRow } from '../../store/chat/types';

export async function getMessages(conversationId: string): Promise<MessageRow[]> {
  const db = await getDb();
  return db.select<MessageRow[]>(
    'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId],
  );
}

export async function getMessagesByConversation(conversationId: string): Promise<{ role: string; content: string }[]> {
  const db = await getDb();
  return db.select<{ role: string; content: string }[]>(
    'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId],
  );
}

export async function insertMessage(msg: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  thinking?: string;
  parts?: string;
  tokenCount?: string | null;
  ragResults?: string;
  searchResults?: string;
  createdAt: number;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR IGNORE INTO messages (id, conversation_id, role, content, thinking, parts, token_count, rag_results, search_results, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [msg.id, msg.conversationId, msg.role, msg.content, msg.thinking || '', msg.parts || '', msg.tokenCount ?? null, msg.ragResults || '', msg.searchResults || '', msg.createdAt],
  );
}

export async function insertUserMessage(id: string, conversationId: string, content: string, createdAt: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)',
    [id, conversationId, 'user', content, createdAt],
  );
}

export async function insertErrorMessage(id: string, conversationId: string, content: string, createdAt: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR IGNORE INTO messages (id, conversation_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)',
    [id, conversationId, 'error', content, createdAt],
  );
}

export async function updateMessageContent(id: string, content: string): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE messages SET content = $1 WHERE id = $2', [content, id]);
}

export async function updateAssistantMessageContent(id: string, content: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE messages SET content = $1, thinking = '', parts = '', token_count = NULL, rag_results = '', search_results = '' WHERE id = $2",
    [content, id],
  );
}

export async function deleteMessagesByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  await db.execute(`DELETE FROM messages WHERE id IN (${placeholders})`, ids);
}

export async function deleteMessagesByConversation(conversationId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM messages WHERE conversation_id = $1', [conversationId]);
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM messages WHERE id = $1', [id]);
}

export async function getAttachmentPathsByMessageIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await db.select<{ path: string }[]>(
    `SELECT path FROM attachments WHERE message_id IN (${placeholders})`,
    ids,
  );
  return rows.map((r) => r.path);
}

export async function insertBranchMessage(
  id: string, conversationId: string, role: string, content: string, thinking: string, parts: string, createdAt: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO messages (id, conversation_id, role, content, thinking, parts, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, conversationId, role, content, thinking, parts, createdAt],
  );
}
