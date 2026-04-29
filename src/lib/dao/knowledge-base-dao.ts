import { getDb } from '../db';
import { nowUnix } from '../utils';

export interface KnowledgeBaseRow {
  id: string;
  name: string;
  description: string;
  embedding_provider_id: number | null;
  embedding_model: string;
  dimensions: number;
  chunk_size: number;
  chunk_overlap: number;
  created_at: number;
  updated_at: number;
}

export interface KnowledgeDocumentRow {
  id: string;
  knowledge_base_id: string;
  name: string;
  type: 'pdf' | 'docx' | 'url' | 'txt' | 'md';
  source: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
  chunk_count: number;
  created_at: number;
}

export interface KnowledgeChunkRow {
  id: number;
  document_id: string;
  content: string;
  position: number;
  token_count: number | null;
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseRow[]> {
  const db = await getDb();
  return db.select<KnowledgeBaseRow[]>('SELECT * FROM knowledge_bases ORDER BY created_at DESC');
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBaseRow | null> {
  const db = await getDb();
  const rows = await db.select<KnowledgeBaseRow[]>('SELECT * FROM knowledge_bases WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function insertKnowledgeBase(
  id: string,
  data: Omit<KnowledgeBaseRow, 'id' | 'created_at' | 'updated_at'>,
): Promise<void> {
  const db = await getDb();
  const now = nowUnix();
  await db.execute(
    `INSERT INTO knowledge_bases (id, name, description, embedding_provider_id, embedding_model, dimensions, chunk_size, chunk_overlap, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, data.name, data.description, data.embedding_provider_id, data.embedding_model,
      data.dimensions, data.chunk_size, data.chunk_overlap, now, now],
  );
}

const ALLOWED_FIELDS = new Set([
  'name', 'description', 'embedding_provider_id', 'embedding_model',
  'dimensions', 'chunk_size', 'chunk_overlap',
]);

export async function updateKnowledgeBase(
  id: string,
  data: Partial<Omit<KnowledgeBaseRow, 'id' | 'created_at' | 'updated_at'>>,
): Promise<void> {
  const db = await getDb();
  const now = nowUnix();
  const fields = Object.keys(data) as (keyof typeof data)[];
  for (const f of fields) {
    if (!ALLOWED_FIELDS.has(f)) throw new Error(`不允许更新的字段: ${f}`);
  }
  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map((f) => data[f]);
  await db.execute(
    `UPDATE knowledge_bases SET ${setClauses}, updated_at = $${fields.length + 1} WHERE id = $${fields.length + 2}`,
    [...values, now, id],
  );
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM knowledge_bases WHERE id = $1', [id]);
}

export async function listDocuments(knowledgeBaseId: string): Promise<KnowledgeDocumentRow[]> {
  const db = await getDb();
  return db.select<KnowledgeDocumentRow[]>(
    'SELECT * FROM knowledge_documents WHERE knowledge_base_id = $1 ORDER BY created_at DESC',
    [knowledgeBaseId],
  );
}

export async function getDocumentChunks(documentId: string): Promise<KnowledgeChunkRow[]> {
  const db = await getDb();
  return db.select<KnowledgeChunkRow[]>(
    'SELECT * FROM knowledge_chunks WHERE document_id = $1 ORDER BY position ASC',
    [documentId],
  );
}

export async function getDocumentDimensions(documentId: string): Promise<number | undefined> {
  const db = await getDb();
  const rows = await db.select<{ dimensions: number }[]>(
    `SELECT kb.dimensions FROM knowledge_documents d
     JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id
     WHERE d.id = $1`,
    [documentId],
  );
  return rows[0]?.dimensions;
}

export async function deleteDocument(documentId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM knowledge_documents WHERE id = $1', [documentId]);
}

export async function insertDocument(
  id: string, knowledgeBaseId: string, name: string, type: string, source: string, createdAt: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO knowledge_documents (id, knowledge_base_id, name, type, source, status, error, chunk_count, created_at)
     VALUES ($1,$2,$3,$4,$5,'pending',NULL,0,$6)`,
    [id, knowledgeBaseId, name, type, source, createdAt],
  );
}

export async function updateDocumentStatus(id: string, status: KnowledgeDocumentRow['status'], error?: string | null, chunkCount?: number): Promise<void> {
  const db = await getDb();
  if (status === 'completed' && chunkCount !== undefined) {
    await db.execute("UPDATE knowledge_documents SET status = 'completed', chunk_count = $1 WHERE id = $2", [chunkCount, id]);
  } else if (status === 'failed' && error !== undefined) {
    await db.execute("UPDATE knowledge_documents SET status = 'failed', error = $1 WHERE id = $2", [error, id]);
  } else {
    await db.execute("UPDATE knowledge_documents SET status = $1, error = NULL WHERE id = $2", [status, id]);
  }
}

export async function resetDocumentsStatus(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const ph = ids.map((_, i) => `$${i + 1}`).join(', ');
  await db.execute(
    `UPDATE knowledge_documents SET status = 'pending', chunk_count = 0 WHERE id IN (${ph})`,
    ids,
  );
}

export async function updateKnowledgeBaseDimensions(id: string, dimensions: number): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE knowledge_bases SET dimensions = $1 WHERE id = $2', [dimensions, id]);
}

export async function getDocument(id: string): Promise<KnowledgeDocumentRow | null> {
  const db = await getDb();
  const rows = await db.select<KnowledgeDocumentRow[]>('SELECT * FROM knowledge_documents WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getConversationKnowledgeBases(conversationId: string): Promise<KnowledgeBaseRow[]> {
  const db = await getDb();
  return db.select<KnowledgeBaseRow[]>(
    `SELECT kb.* FROM knowledge_bases kb
     INNER JOIN conversation_knowledge_bases ckb ON ckb.knowledge_base_id = kb.id
     WHERE ckb.conversation_id = $1
     ORDER BY kb.created_at DESC`,
    [conversationId],
  );
}

export async function setConversationKnowledgeBases(conversationId: string, kbIds: string[]): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM conversation_knowledge_bases WHERE conversation_id = $1', [conversationId]);
  for (const kbId of kbIds) {
    await db.execute(
      'INSERT INTO conversation_knowledge_bases (conversation_id, knowledge_base_id) VALUES ($1, $2)',
      [conversationId, kbId],
    );
  }
}

export async function getKnowledgeBasesByIds(ids: string[]): Promise<KnowledgeBaseRow[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  return db.select<KnowledgeBaseRow[]>(
    `SELECT * FROM knowledge_bases WHERE id IN (${placeholders})`,
    ids,
  );
}
