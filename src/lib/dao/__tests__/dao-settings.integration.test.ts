import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDatabase } from '../../__tests__/test-db';

let testDb: TestDatabase;

vi.mock('../../db', () => ({
  getDb: () => Promise.resolve(testDb),
}));

import * as settingsDao from '../settings-dao';

describe('settings-dao (integration)', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it('getSetting returns existing value', async () => {
    // The migration inserts default settings, but our test-db might skip them.
    // Insert manually:
    await testDb.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['test_key', 'test_value']);
    const result = await settingsDao.getSetting('test_key');
    expect(result).toBe('test_value');
  });

  it('getSetting returns undefined for non-existent key', async () => {
    const result = await settingsDao.getSetting('nonexistent_key');
    expect(result).toBeUndefined();
  });

  it('setSetting inserts new key', async () => {
    await settingsDao.setSetting('new_key', 'new_value');
    const result = await settingsDao.getSetting('new_key');
    expect(result).toBe('new_value');
  });

  it('setSetting updates existing key (upsert)', async () => {
    await settingsDao.setSetting('key1', 'value1');
    await settingsDao.setSetting('key1', 'value2');
    const result = await settingsDao.getSetting('key1');
    expect(result).toBe('value2');
  });

  it('getAllSettings returns all key-value pairs', async () => {
    await settingsDao.setSetting('a', '1');
    await settingsDao.setSetting('b', '2');
    await settingsDao.setSetting('c', '3');

    const all = await settingsDao.getAllSettings();
    expect(all['a']).toBe('1');
    expect(all['b']).toBe('2');
    expect(all['c']).toBe('3');
  });

  it('getSettings returns subset of keys', async () => {
    await settingsDao.setSetting('x', '10');
    await settingsDao.setSetting('y', '20');
    await settingsDao.setSetting('z', '30');

    const subset = await settingsDao.getSettings(['x', 'z']);
    expect(subset['x']).toBe('10');
    expect(subset['z']).toBe('30');
    expect(subset['y']).toBeUndefined();
  });

  it('getSettings returns empty object for empty keys array', async () => {
    const result = await settingsDao.getSettings([]);
    expect(result).toEqual({});
  });

  it('getSettings ignores non-existent keys', async () => {
    await settingsDao.setSetting('exists', 'yes');
    const result = await settingsDao.getSettings(['exists', 'nope']);
    expect(result).toEqual({ exists: 'yes' });
  });

  it('handles special characters in values', async () => {
    const value = '{"url":"https://api.com","key":"sk-test123"}';
    await settingsDao.setSetting('json_config', value);
    expect(await settingsDao.getSetting('json_config')).toBe(value);
  });

  it('handles empty string values', async () => {
    await settingsDao.setSetting('empty', '');
    expect(await settingsDao.getSetting('empty')).toBe('');
  });
});
