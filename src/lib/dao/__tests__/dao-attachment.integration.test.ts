import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDatabase } from '../../__tests__/test-db';

let testDb: TestDatabase;

vi.mock('../../db', () => ({
  getDb: () => Promise.resolve(testDb),
}));

import * as attachmentDao from '../attachment-dao';

describe('attachment-dao (integration)', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    // Set up conversation and message for foreign keys
    await testDb.execute(
      "INSERT INTO conversations (id, title, provider_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ['conv1', '测试对话', -2, 'gpt-4', 1000, 1000],
    );
    await testDb.execute(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ['m1', 'conv1', 'user', '看图', 1000],
    );
    await testDb.execute(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ['m2', 'conv1', 'user', '第二条', 2000],
    );
  });

  afterEach(() => {
    testDb.close();
  });

  it('insertAttachment and getAttachmentsByConversation', async () => {
    await attachmentDao.insertAttachment('a1', 'm1', 'image', 'pic.png', '/path/pic.png', 0, 1000);
    await attachmentDao.insertAttachment('a2', 'm1', 'file', 'doc.pdf', '/path/doc.pdf', 1, 1000);

    const atts = await attachmentDao.getAttachmentsByConversation('conv1');
    expect(atts).toHaveLength(2);
    expect(atts[0].name).toBe('pic.png');
    expect(atts[0].type).toBe('image');
    expect(atts[1].name).toBe('doc.pdf');
    expect(atts[1].type).toBe('file');
  });

  it('attachments are ordered by sort_order', async () => {
    await attachmentDao.insertAttachment('a1', 'm1', 'image', 'second.png', '/p/second.png', 1, 1000);
    await attachmentDao.insertAttachment('a2', 'm1', 'image', 'first.png', '/p/first.png', 0, 1000);

    const atts = await attachmentDao.getAttachmentsByConversation('conv1');
    expect(atts[0].name).toBe('first.png');
    expect(atts[1].name).toBe('second.png');
  });

  it('getAttachmentsByConversation returns attachments from all messages', async () => {
    await attachmentDao.insertAttachment('a1', 'm1', 'image', 'img1.png', '/p/img1.png', 0, 1000);
    await attachmentDao.insertAttachment('a2', 'm2', 'image', 'img2.png', '/p/img2.png', 0, 2000);

    const atts = await attachmentDao.getAttachmentsByConversation('conv1');
    expect(atts).toHaveLength(2);
  });

  it('getAttachmentsByConversation returns empty for no attachments', async () => {
    const atts = await attachmentDao.getAttachmentsByConversation('conv1');
    expect(atts).toHaveLength(0);
  });

  it('getSharedPaths returns paths that exist in DB', async () => {
    await attachmentDao.insertAttachment('a1', 'm1', 'image', 'pic.png', '/path/pic.png', 0, 1000);
    await attachmentDao.insertAttachment('a2', 'm1', 'file', 'doc.pdf', '/path/doc.pdf', 1, 1000);

    const shared = await attachmentDao.getSharedPaths(['/path/pic.png', '/path/other.txt']);
    expect(shared.size).toBe(1);
    expect(shared.has('/path/pic.png')).toBe(true);
    expect(shared.has('/path/other.txt')).toBe(false);
  });

  it('getSharedPaths returns empty set for empty input', async () => {
    const shared = await attachmentDao.getSharedPaths([]);
    expect(shared.size).toBe(0);
  });

  it('getSharedPaths deduplicates paths', async () => {
    await attachmentDao.insertAttachment('a1', 'm1', 'image', 'pic.png', '/path/pic.png', 0, 1000);
    await attachmentDao.insertAttachment('a2', 'm2', 'image', 'pic2.png', '/path/pic.png', 0, 2000);

    const shared = await attachmentDao.getSharedPaths(['/path/pic.png']);
    expect(shared.size).toBe(1);
  });

  it('attachments are cascade deleted when message is deleted', async () => {
    await attachmentDao.insertAttachment('a1', 'm1', 'image', 'pic.png', '/path/pic.png', 0, 1000);
    await testDb.execute("DELETE FROM messages WHERE id = ?", ['m1']);

    const atts = await attachmentDao.getAttachmentsByConversation('conv1');
    expect(atts).toHaveLength(0);
  });

  it('attachments are cascade deleted when conversation is deleted', async () => {
    await attachmentDao.insertAttachment('a1', 'm1', 'image', 'pic.png', '/path/pic.png', 0, 1000);
    await testDb.execute("DELETE FROM conversations WHERE id = ?", ['conv1']);

    const rows = await testDb.select<{ id: string }[]>('SELECT id FROM attachments');
    expect(rows).toHaveLength(0);
  });
});
