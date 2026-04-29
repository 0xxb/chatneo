import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDatabase } from '../../__tests__/test-db';

let testDb: TestDatabase;

vi.mock('../../db', () => ({
  getDb: () => Promise.resolve(testDb),
}));

import * as conversationDao from '../conversation-dao';

describe('conversation-dao (integration)', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it('insertConversation and loadConversations', async () => {
    await conversationDao.insertConversation('c1', '对话1', -2, 'gpt-4', 1000);
    await conversationDao.insertConversation('c2', '对话2', -1, 'llama3', 2000);

    const convs = await conversationDao.loadConversations();
    expect(convs).toHaveLength(2);
    // Ordered by updated_at DESC
    expect(convs[0].id).toBe('c2');
    expect(convs[1].id).toBe('c1');
  });

  it('conversationExists returns correct value', async () => {
    await conversationDao.insertConversation('c1', '对话1', -2, 'gpt-4', 1000);
    expect(await conversationDao.conversationExists('c1')).toBe(true);
    expect(await conversationDao.conversationExists('nonexistent')).toBe(false);
  });

  it('deleteConversation removes conversation and messages (cascade)', async () => {
    await conversationDao.insertConversation('c1', '对话1', -2, 'gpt-4', 1000);
    // Insert a message for this conversation
    await testDb.execute(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ['m1', 'c1', 'user', 'hello', 1000],
    );

    await conversationDao.deleteConversation('c1');
    expect(await conversationDao.conversationExists('c1')).toBe(false);
    // Message should also be deleted (cascade)
    const msgs = await testDb.select<{ id: string }[]>(
      'SELECT id FROM messages WHERE conversation_id = ?', ['c1'],
    );
    expect(msgs).toHaveLength(0);
  });

  it('renameConversation updates title', async () => {
    await conversationDao.insertConversation('c1', '旧标题', -2, 'gpt-4', 1000);
    await conversationDao.renameConversation('c1', '新标题');

    const convs = await conversationDao.loadConversations();
    expect(convs[0].title).toBe('新标题');
  });

  it('updateConversationTimestamp updates updated_at', async () => {
    await conversationDao.insertConversation('c1', '对话', -2, 'gpt-4', 1000);
    await conversationDao.updateConversationTimestamp('c1', 5000);

    const convs = await conversationDao.loadConversations();
    expect(convs[0].updated_at).toBe(5000);
  });

  it('toggleConversationPinned toggles pin state', async () => {
    await conversationDao.insertConversation('c1', '对话', -2, 'gpt-4', 1000);

    const pinned1 = await conversationDao.toggleConversationPinned('c1');
    expect(pinned1).toBe(1);

    const pinned2 = await conversationDao.toggleConversationPinned('c1');
    expect(pinned2).toBe(0);
  });

  it('pinned conversations sort first', async () => {
    await conversationDao.insertConversation('c1', '旧对话', -2, 'gpt-4', 1000);
    await conversationDao.insertConversation('c2', '新对话', -2, 'gpt-4', 2000);
    await conversationDao.toggleConversationPinned('c1');

    const convs = await conversationDao.loadConversations();
    // c1 pinned should come first despite older
    expect(convs[0].id).toBe('c1');
    expect(convs[1].id).toBe('c2');
  });

  it('toggleConversationArchived and loadArchivedConversations', async () => {
    await conversationDao.insertConversation('c1', '对话', -2, 'gpt-4', 1000);
    await conversationDao.toggleConversationArchived('c1');

    // Should not appear in normal list
    const normal = await conversationDao.loadConversations();
    expect(normal).toHaveLength(0);

    // Should appear in archived list
    const archived = await conversationDao.loadArchivedConversations();
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe('c1');
  });

  it('searchConversations filters by title keyword', async () => {
    await conversationDao.insertConversation('c1', 'React 教程', -2, 'gpt-4', 1000);
    await conversationDao.insertConversation('c2', 'Vue 指南', -2, 'gpt-4', 2000);
    await conversationDao.insertConversation('c3', 'React 进阶', -2, 'gpt-4', 3000);

    const results = await conversationDao.searchConversations('React');
    expect(results).toHaveLength(2);
    expect(results.every((c) => c.title.includes('React'))).toBe(true);
  });

  it('searchConversations escapes special characters', async () => {
    await conversationDao.insertConversation('c1', '100% 完成', -2, 'gpt-4', 1000);
    await conversationDao.insertConversation('c2', '其他对话', -2, 'gpt-4', 2000);

    const results = await conversationDao.searchConversations('100%');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('100% 完成');
  });

  it('updateConversationModel changes provider and model', async () => {
    await conversationDao.insertConversation('c1', '对话', -2, 'gpt-4', 1000);
    await conversationDao.updateConversationModel('c1', -3, 'claude-3');

    const convs = await conversationDao.loadConversations();
    expect(convs[0].provider_id).toBe(-3);
    expect(convs[0].model_id).toBe('claude-3');
  });

  it('loadConversations respects limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await conversationDao.insertConversation(`c${i}`, `对话${i}`, -2, 'gpt-4', 1000 + i);
    }

    const page1 = await conversationDao.loadConversations(2, 0);
    expect(page1).toHaveLength(2);

    const page2 = await conversationDao.loadConversations(2, 2);
    expect(page2).toHaveLength(2);

    // No overlap
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it('getConversationAttachmentPaths returns attachment paths', async () => {
    await conversationDao.insertConversation('c1', '对话', -2, 'gpt-4', 1000);
    await testDb.execute(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ['m1', 'c1', 'user', 'hi', 1000],
    );
    await testDb.execute(
      "INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['a1', 'm1', 'image', 'pic.png', '/path/pic.png', 0, 1000],
    );

    const paths = await conversationDao.getConversationAttachmentPaths('c1');
    expect(paths).toEqual(['/path/pic.png']);
  });
});
