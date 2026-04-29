import Database from '@tauri-apps/plugin-sql';

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load('sqlite:chatneo.db')
      .then(async (db) => {
        await db.execute('PRAGMA journal_mode = WAL');
        await db.execute('PRAGMA foreign_keys = ON');
        return db;
      })
      .catch((e) => {
        dbPromise = null; // allow retry on failure
        throw e;
      });
  }
  return dbPromise;
}
