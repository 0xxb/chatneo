import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDatabase } from '../../__tests__/test-db';

let testDb: TestDatabase;

vi.mock('../../db', () => ({
  getDb: () => Promise.resolve(testDb),
}));

import { updateDocumentStatus, updateKnowledgeBaseDimensions } from '../knowledge-base-dao';

describe('knowledge-base-dao — extra coverage', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    await testDb.execute(
      `INSERT INTO knowledge_bases (id, name, embedding_provider_id, embedding_model, dimensions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['kb1', '测试知识库', 1, 'emb-model', 768, 1000, 1000],
    );
    await testDb.execute(
      `INSERT INTO knowledge_documents (id, knowledge_base_id, name, type, source, status, chunk_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['doc1', 'kb1', '文档1', 'txt', '/path/doc.txt', 'pending', 0, 1000],
    );
  });

  afterEach(() => {
    testDb.close();
  });

  it('updateDocumentStatus sets generic status with NULL error', async () => {
    await updateDocumentStatus('doc1', 'processing');
    const rows = await testDb.select<{ status: string; error: string | null }[]>(
      'SELECT status, error FROM knowledge_documents WHERE id = ?', ['doc1'],
    );
    expect(rows[0].status).toBe('processing');
    expect(rows[0].error).toBeNull();
  });

  it('updateKnowledgeBaseDimensions updates dimensions', async () => {
    await updateKnowledgeBaseDimensions('kb1', 1536);
    const rows = await testDb.select<{ dimensions: number }[]>(
      'SELECT dimensions FROM knowledge_bases WHERE id = ?', ['kb1'],
    );
    expect(rows[0].dimensions).toBe(1536);
  });
});
