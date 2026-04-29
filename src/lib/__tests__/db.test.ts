import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn().mockResolvedValue({ rowsAffected: 0 });
const mockDb = { execute: mockExecute };
const mockLoad = vi.fn().mockResolvedValue(mockDb);

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: (...args: unknown[]) => mockLoad(...args) },
}));

describe('db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module to clear cached dbPromise
    vi.resetModules();
  });

  it('initializes with WAL and foreign keys', async () => {
    const { getDb } = await import('../db');
    const db = await getDb();
    expect(db).toBe(mockDb);
    expect(mockLoad).toHaveBeenCalledWith('sqlite:chatneo.db');
    expect(mockExecute).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    expect(mockExecute).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
  });

  it('reuses same promise on subsequent calls', async () => {
    const { getDb } = await import('../db');
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('resets promise on load failure allowing retry', async () => {
    mockLoad.mockRejectedValueOnce(new Error('load failed'));
    const { getDb } = await import('../db');

    await expect(getDb()).rejects.toThrow('load failed');

    // Second call should retry
    mockLoad.mockResolvedValueOnce(mockDb);
    const db = await getDb();
    expect(db).toBe(mockDb);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });
});
