import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock('../mcp-stdio-transport', () => ({
  TauriStdioTransport: vi.fn(),
}));
vi.mock('../mcp-db', () => ({
  getAllMcpServers: vi.fn().mockResolvedValue([]),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../utils', () => ({
  isChatWindow: () => true,
}));

import { convertSchema, convertSingleType } from '../mcp-manager';

describe('MCP JSON Schema to Zod conversion', () => {
  describe('convertSingleType', () => {
    it('converts string type', () => {
      const schema = convertSingleType({ type: 'string' });
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse(123)).toThrow();
    });

    it('converts number type', () => {
      const schema = convertSingleType({ type: 'number' });
      expect(schema.parse(42)).toBe(42);
      expect(() => schema.parse('abc')).toThrow();
    });

    it('converts integer type as number', () => {
      const schema = convertSingleType({ type: 'integer' });
      expect(schema.parse(42)).toBe(42);
    });

    it('converts boolean type', () => {
      const schema = convertSingleType({ type: 'boolean' });
      expect(schema.parse(true)).toBe(true);
      expect(() => schema.parse('true')).toThrow();
    });

    it('converts array type with items', () => {
      const schema = convertSingleType({ type: 'array', items: { type: 'string' } });
      expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
      expect(() => schema.parse([1, 2])).toThrow();
    });

    it('converts array type without items as unknown[]', () => {
      const schema = convertSingleType({ type: 'array' });
      expect(schema.parse([1, 'a', true])).toEqual([1, 'a', true]);
    });

    it('converts object type without properties as record', () => {
      const schema = convertSingleType({ type: 'object' });
      expect(schema.parse({ any: 'value' })).toEqual({ any: 'value' });
    });

    it('converts enum values', () => {
      const schema = convertSingleType({ enum: ['red', 'green', 'blue'] });
      expect(schema.parse('red')).toBe('red');
      expect(() => schema.parse('yellow')).toThrow();
    });

    it('falls back to string for empty enum', () => {
      const schema = convertSingleType({ enum: [] });
      expect(schema.parse('anything')).toBe('anything');
    });

    it('falls back to unknown for unrecognized type', () => {
      const schema = convertSingleType({ type: 'null' });
      // z.unknown() accepts anything
      expect(schema.parse(null)).toBeNull();
      expect(schema.parse('anything')).toBe('anything');
    });

    it('adds description to schema', () => {
      const schema = convertSingleType({ type: 'string', description: '用户名' });
      expect(schema.description).toBe('用户名');
    });
  });

  describe('convertSchema', () => {
    it('converts object with properties', () => {
      const schema = convertSchema({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      });

      expect(schema.parse({ name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 });
      expect(schema.parse({ name: 'Bob' })).toEqual({ name: 'Bob' });
      expect(() => schema.parse({ age: 30 })).toThrow(); // name is required
    });

    it('makes non-required fields optional', () => {
      const schema = convertSchema({
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
        },
        required: ['a'],
      });

      const result = schema.parse({ a: 'hello' });
      expect(result.a).toBe('hello');
      expect(result.b).toBeUndefined();
    });

    it('handles no required array (all optional)', () => {
      const schema = convertSchema({
        properties: {
          x: { type: 'string' },
        },
      });

      expect(schema.parse({})).toEqual({});
    });

    it('handles nested objects', () => {
      const schema = convertSchema({
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      });

      expect(schema.parse({ user: { name: 'Alice' } })).toEqual({ user: { name: 'Alice' } });
      expect(() => schema.parse({ user: { email: 'a@b.com' } })).toThrow();
    });

    it('handles array of objects', () => {
      const schema = convertSchema({
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'number' } },
              required: ['id'],
            },
          },
        },
        required: ['items'],
      });

      expect(schema.parse({ items: [{ id: 1 }, { id: 2 }] })).toEqual({ items: [{ id: 1 }, { id: 2 }] });
    });

    it('falls through to convertSingleType when no properties', () => {
      const schema = convertSchema({ type: 'string' });
      expect(schema.parse('hello')).toBe('hello');
    });
  });
});
