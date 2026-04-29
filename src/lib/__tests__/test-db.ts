/**
 * Test database helper — creates an in-memory SQLite database
 * that mimics the @tauri-apps/plugin-sql Database interface.
 */
import BetterSqlite3 from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface TestDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number }>;
  close(): void;
}

/**
 * Normalize $1, $2, ... placeholders to ? for better-sqlite3.
 * Handles re-use of same placeholder (e.g. $2 appearing twice) by
 * expanding bindValues to match positional ? markers.
 * If no $N patterns found, assumes already using ? and passes through.
 */
function normalizePlaceholders(sql: string, bindValues?: unknown[]): { sql: string; values: unknown[] } {
  if (!bindValues || bindValues.length === 0) {
    return { sql: sql.replace(/\$\d+/g, '?'), values: [] };
  }
  // Check if SQL uses $N style placeholders
  if (!/\$\d+/.test(sql)) {
    // Already uses ? style
    return { sql, values: bindValues };
  }
  const values: unknown[] = [];
  const normalized = sql.replace(/\$(\d+)/g, (_, num) => {
    const idx = parseInt(num, 10) - 1; // $1 → index 0
    values.push(bindValues[idx]);
    return '?';
  });
  return { sql: normalized, values };
}

// Cache parsed migration statements at module level to avoid re-reading from disk per test
let cachedStatements: string[] | null = null;

function getMigrationStatements(): string[] {
  if (!cachedStatements) {
    const migrationPath = resolve(__dirname, '../../../src-tauri/migrations/001_initial.sql');
    const schema = readFileSync(migrationPath, 'utf-8');
    cachedStatements = schema.split(/;\s*\n/).filter((s) => s.trim());
  }
  return cachedStatements;
}

export function createTestDb(): TestDatabase {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const statements = getMigrationStatements();
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    try {
      db.exec(trimmed);
    } catch (e) {
      // Skip CREATE INDEX IF NOT EXISTS errors on already created tables
      if (!(e instanceof Error && e.message.includes('already exists'))) {
        // Some INSERT statements have issues with complex expressions, skip those
        if (!trimmed.startsWith('INSERT INTO prompts') && !trimmed.startsWith('INSERT INTO settings')) {
          throw e;
        }
      }
    }
  }

  return {
    async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
      const { sql: normalized, values } = normalizePlaceholders(query, bindValues);
      const stmt = db.prepare(normalized);
      const rows = stmt.all(...values);
      return rows as T;
    },
    async execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number }> {
      const { sql: normalized, values } = normalizePlaceholders(query, bindValues);
      const stmt = db.prepare(normalized);
      const result = stmt.run(...values);
      return { rowsAffected: result.changes };
    },
    close() {
      db.close();
    },
  };
}
