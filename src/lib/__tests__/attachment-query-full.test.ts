import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDatabase } from './test-db';

let testDb: TestDatabase;

vi.mock('../db', () => ({
  getDb: () => Promise.resolve(testDb),
}));

vi.mock('../attachments', () => ({
  getAttachmentUrl: (path: string) => `asset://localhost/${path}`,
}));

import { queryRecentAttachments } from '../attachment-query';

describe('queryRecentAttachments', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  async function insertConvAndMsg() {
    await testDb.execute(
      "INSERT INTO conversations (id, title, provider_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ['c1', '测试', -2, 'gpt-4', 1000, 1000],
    );
    await testDb.execute(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ['m1', 'c1', 'user', 'hello', 1000],
    );
    await testDb.execute(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ['m2', 'c1', 'user', 'world', 2000],
    );
  }

  it('returns empty array when no attachments', async () => {
    const result = await queryRecentAttachments();
    expect(result).toEqual([]);
  });

  it('returns attachments sorted by created_at DESC', async () => {
    await insertConvAndMsg();
    await testDb.execute(
      "INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['a1', 'm1', 'image', 'photo.png', '/path/photo.png', 0, 1000],
    );
    await testDb.execute(
      "INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['a2', 'm2', 'file', 'doc.pdf', '/path/doc.pdf', 0, 2000],
    );

    const result = await queryRecentAttachments();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('doc.pdf');
    expect(result[1].name).toBe('photo.png');
  });

  it('deduplicates by name+path, keeping latest', async () => {
    await insertConvAndMsg();
    await testDb.execute(
      "INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['a1', 'm1', 'image', 'photo.png', '/path/photo.png', 0, 1000],
    );
    await testDb.execute(
      "INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['a2', 'm2', 'image', 'photo.png', '/path/photo.png', 0, 2000],
    );

    const result = await queryRecentAttachments();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a2');
  });

  it('respects limit parameter', async () => {
    await insertConvAndMsg();
    for (let i = 0; i < 5; i++) {
      await testDb.execute(
        "INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [`a${i}`, 'm1', 'file', `file${i}.txt`, `/path/file${i}.txt`, 0, 1000 + i],
      );
    }

    const result = await queryRecentAttachments(3);
    expect(result).toHaveLength(3);
  });

  it('sets preview for image type, undefined for file type', async () => {
    await insertConvAndMsg();
    await testDb.execute(
      "INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['a1', 'm1', 'image', 'pic.png', '/path/pic.png', 0, 1000],
    );
    await testDb.execute(
      "INSERT INTO attachments (id, message_id, type, name, path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['a2', 'm2', 'file', 'doc.pdf', '/path/doc.pdf', 0, 2000],
    );

    const result = await queryRecentAttachments();
    const imageAtt = result.find((a) => a.type === 'image')!;
    const fileAtt = result.find((a) => a.type === 'file')!;

    expect(imageAtt.preview).toBe('asset://localhost//path/pic.png');
    expect(fileAtt.preview).toBeUndefined();
  });
});
