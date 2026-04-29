import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDatabase } from '../../__tests__/test-db';

let testDb: TestDatabase;

vi.mock('../../db', () => ({
  getDb: () => Promise.resolve(testDb),
}));

import * as messageDao from '../message-dao';

describe('message-dao (integration)', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    // Create a conversation for foreign key
    await testDb.execute(
      "INSERT INTO conversations (id, title, provider_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ['conv1', '测试对话', -2, 'gpt-4', 1000, 1000],
    );
  });

  afterEach(() => {
    testDb.close();
  });

  it('insertMessage and getMessages', async () => {
    await messageDao.insertMessage({
      id: 'm1',
      conversationId: 'conv1',
      role: 'user',
      content: '你好',
      createdAt: 1000,
    });
    await messageDao.insertMessage({
      id: 'm2',
      conversationId: 'conv1',
      role: 'assistant',
      content: '你好！',
      thinking: '思考...',
      createdAt: 2000,
    });

    const msgs = await messageDao.getMessages('conv1');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('你好');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('你好！');
    expect(msgs[1].thinking).toBe('思考...');
  });

  it('messages are ordered by created_at ASC', async () => {
    await messageDao.insertMessage({ id: 'm2', conversationId: 'conv1', role: 'assistant', content: '回复', createdAt: 2000 });
    await messageDao.insertMessage({ id: 'm1', conversationId: 'conv1', role: 'user', content: '问题', createdAt: 1000 });

    const msgs = await messageDao.getMessages('conv1');
    expect(msgs[0].id).toBe('m1');
    expect(msgs[1].id).toBe('m2');
  });

  it('insertUserMessage creates user role message', async () => {
    await messageDao.insertUserMessage('m1', 'conv1', '用户输入', 1000);

    const msgs = await messageDao.getMessages('conv1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('用户输入');
  });

  it('insertErrorMessage creates error role message', async () => {
    await messageDao.insertErrorMessage('m1', 'conv1', 'API 超时', 1000);

    const msgs = await messageDao.getMessages('conv1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('error');
    expect(msgs[0].content).toBe('API 超时');
  });

  it('insertMessage with INSERT OR IGNORE does not duplicate', async () => {
    await messageDao.insertMessage({ id: 'm1', conversationId: 'conv1', role: 'user', content: '第一次', createdAt: 1000 });
    await messageDao.insertMessage({ id: 'm1', conversationId: 'conv1', role: 'user', content: '第二次', createdAt: 2000 });

    const msgs = await messageDao.getMessages('conv1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('第一次'); // First insert wins
  });

  it('updateMessageContent updates content', async () => {
    await messageDao.insertUserMessage('m1', 'conv1', '原始内容', 1000);
    await messageDao.updateMessageContent('m1', '修改后的内容');

    const msgs = await messageDao.getMessages('conv1');
    expect(msgs[0].content).toBe('修改后的内容');
  });

  it('updateAssistantMessageContent clears metadata fields', async () => {
    await messageDao.insertMessage({
      id: 'm1', conversationId: 'conv1', role: 'assistant', content: '旧内容',
      thinking: '旧思考', parts: '[]', tokenCount: '{"totalTokens":100}',
      ragResults: '[{}]', searchResults: '[{}]', createdAt: 1000,
    });

    await messageDao.updateAssistantMessageContent('m1', '新内容');
    const msgs = await messageDao.getMessages('conv1');
    expect(msgs[0].content).toBe('新内容');
    expect(msgs[0].thinking).toBe('');
    expect(msgs[0].parts).toBe('');
    expect(msgs[0].token_count).toBeNull();
  });

  it('deleteMessage removes single message', async () => {
    await messageDao.insertUserMessage('m1', 'conv1', '消息1', 1000);
    await messageDao.insertUserMessage('m2', 'conv1', '消息2', 2000);
    await messageDao.deleteMessage('m1');

    const msgs = await messageDao.getMessages('conv1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe('m2');
  });

  it('deleteMessagesByIds removes multiple messages', async () => {
    await messageDao.insertUserMessage('m1', 'conv1', '消息1', 1000);
    await messageDao.insertUserMessage('m2', 'conv1', '消息2', 2000);
    await messageDao.insertUserMessage('m3', 'conv1', '消息3', 3000);

    await messageDao.deleteMessagesByIds(['m1', 'm3']);
    const msgs = await messageDao.getMessages('conv1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe('m2');
  });

  it('deleteMessagesByIds handles empty array', async () => {
    await messageDao.insertUserMessage('m1', 'conv1', '消息', 1000);
    await messageDao.deleteMessagesByIds([]);
    const msgs = await messageDao.getMessages('conv1');
    expect(msgs).toHaveLength(1);
  });

  it('deleteMessagesByConversation removes all messages in conversation', async () => {
    await messageDao.insertUserMessage('m1', 'conv1', '消息1', 1000);
    await messageDao.insertUserMessage('m2', 'conv1', '消息2', 2000);

    await messageDao.deleteMessagesByConversation('conv1');
    const msgs = await messageDao.getMessages('conv1');
    expect(msgs).toHaveLength(0);
  });

  it('getMessagesByConversation returns role and content only', async () => {
    await messageDao.insertMessage({
      id: 'm1', conversationId: 'conv1', role: 'user', content: '你好',
      thinking: 'ignored', parts: 'ignored', createdAt: 1000,
    });

    const msgs = await messageDao.getMessagesByConversation('conv1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ role: 'user', content: '你好' });
  });

  it('getAttachmentPathsByMessageIds returns paths', async () => {
    await messageDao.insertUserMessage('m1', 'conv1', 'hi', 1000);
    await testDb.execute(
      "INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['a1', 'm1', 'image', 'pic.png', '/path/pic.png', 0, 1000],
    );
    await testDb.execute(
      "INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['a2', 'm1', 'file', 'doc.pdf', '/path/doc.pdf', 1, 1000],
    );

    const paths = await messageDao.getAttachmentPathsByMessageIds(['m1']);
    expect(paths).toHaveLength(2);
    expect(paths).toContain('/path/pic.png');
    expect(paths).toContain('/path/doc.pdf');
  });

  it('getAttachmentPathsByMessageIds handles empty array', async () => {
    const paths = await messageDao.getAttachmentPathsByMessageIds([]);
    expect(paths).toEqual([]);
  });
});
