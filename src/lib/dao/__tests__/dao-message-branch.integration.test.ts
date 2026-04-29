import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDatabase } from '../../__tests__/test-db';

let testDb: TestDatabase;

vi.mock('../../db', () => ({
  getDb: () => Promise.resolve(testDb),
}));

import { insertBranchMessage } from '../message-dao';

describe('message-dao — insertBranchMessage', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    await testDb.execute(
      `INSERT INTO conversations (id, title, provider_id, model_id, pinned, archived, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['conv1', '测试', 1, 'gpt-4', 0, 0, '', 1000, 1000],
    );
  });

  afterEach(() => {
    testDb.close();
  });

  it('inserts a branch message with correct fields', async () => {
    await insertBranchMessage('bm1', 'conv1', 'user', '分支内容', '思考', '[]', 2000);
    const rows = await testDb.select<{ id: string; conversation_id: string; role: string; content: string; thinking: string; parts: string }[]>(
      'SELECT * FROM messages WHERE id = ?', ['bm1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].conversation_id).toBe('conv1');
    expect(rows[0].role).toBe('user');
    expect(rows[0].content).toBe('分支内容');
    expect(rows[0].thinking).toBe('思考');
    expect(rows[0].parts).toBe('[]');
  });
});
