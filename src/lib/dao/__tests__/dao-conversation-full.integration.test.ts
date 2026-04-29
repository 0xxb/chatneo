import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDatabase } from '../../__tests__/test-db';

let testDb: TestDatabase;

vi.mock('../../db', () => ({
  getDb: () => Promise.resolve(testDb),
}));

import * as conversationDao from '../conversation-dao';

describe('conversation-dao — additional coverage', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it('updateConversationModelAndTimestamp updates all fields', async () => {
    await conversationDao.insertConversation('c1', '对话', -2, 'gpt-4', 1000);
    await conversationDao.updateConversationModelAndTimestamp('c1', -3, 'claude-3', 5000);

    const convs = await conversationDao.loadConversations();
    expect(convs[0].provider_id).toBe(-3);
    expect(convs[0].model_id).toBe('claude-3');
    expect(convs[0].updated_at).toBe(5000);
  });

  it('clearConversationSummary clears summary field', async () => {
    await conversationDao.insertConversation('c1', '对话', -2, 'gpt-4', 1000);
    await testDb.execute(
      "UPDATE conversations SET summary = ? WHERE id = ?",
      ['some summary', 'c1'],
    );

    await conversationDao.clearConversationSummary('c1');

    const rows = await testDb.select<{ summary: string }[]>(
      'SELECT summary FROM conversations WHERE id = ?', ['c1'],
    );
    expect(rows[0].summary).toBe('');
  });

  it('getConversationPartStrings returns parts from messages', async () => {
    await conversationDao.insertConversation('c1', '对话', -2, 'gpt-4', 1000);
    await testDb.execute(
      "INSERT INTO messages (id, conversation_id, role, content, parts, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ['m1', 'c1', 'assistant', 'hello', '[{"type":"text"}]', 1000],
    );
    await testDb.execute(
      "INSERT INTO messages (id, conversation_id, role, content, parts, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ['m2', 'c1', 'user', 'hi', '', 2000],
    );

    const parts = await conversationDao.getConversationPartStrings('c1');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('[{"type":"text"}]');
    expect(parts[1]).toBe('');
  });

  it('toggleConversationArchived toggles and returns value', async () => {
    await conversationDao.insertConversation('c1', '对话', -2, 'gpt-4', 1000);

    const archived1 = await conversationDao.toggleConversationArchived('c1');
    expect(archived1).toBe(1);

    const archived2 = await conversationDao.toggleConversationArchived('c1');
    expect(archived2).toBe(0);
  });

  it('loadArchivedConversations respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await conversationDao.insertConversation(`c${i}`, `对话${i}`, -2, 'gpt-4', 1000 + i);
      await conversationDao.toggleConversationArchived(`c${i}`);
    }

    const archived = await conversationDao.loadArchivedConversations(3);
    expect(archived).toHaveLength(3);
  });

  it('searchConversations excludes archived', async () => {
    await conversationDao.insertConversation('c1', 'React 教程', -2, 'gpt-4', 1000);
    await conversationDao.insertConversation('c2', 'React 进阶', -2, 'gpt-4', 2000);
    await conversationDao.toggleConversationArchived('c2');

    const results = await conversationDao.searchConversations('React');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('c1');
  });

  it('searchConversations with underscore in keyword', async () => {
    await conversationDao.insertConversation('c1', 'my_project', -2, 'gpt-4', 1000);
    await conversationDao.insertConversation('c2', 'myxproject', -2, 'gpt-4', 2000);

    const results = await conversationDao.searchConversations('my_');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('my_project');
  });
});
