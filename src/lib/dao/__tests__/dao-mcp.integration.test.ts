import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDatabase } from '../../__tests__/test-db';

let testDb: TestDatabase;

vi.mock('../../db', () => ({
  getDb: () => Promise.resolve(testDb),
}));

import { getAllMcpServers, getMcpServer, saveMcpServer, deleteMcpServer, type McpServerConfig } from '../../mcp-db';

function makeConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'srv1',
    name: 'Test Server',
    transport: 'stdio',
    enabled: true,
    command: '/usr/bin/node',
    args: ['server.js'],
    env: { NODE_ENV: 'test' },
    url: undefined,
    headers: {},
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

describe('mcp-db (integration)', () => {
  beforeEach(() => { testDb = createTestDb(); });
  afterEach(() => { testDb.close(); });

  it('saveMcpServer and getAllMcpServers', async () => {
    await saveMcpServer(makeConfig({ id: 'srv1', name: 'Server 1' }));
    await saveMcpServer(makeConfig({ id: 'srv2', name: 'Server 2', created_at: 2000 }));
    const list = await getAllMcpServers();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Server 1');
    expect(list[1].name).toBe('Server 2');
  });

  it('getAllMcpServers returns empty when none', async () => {
    expect(await getAllMcpServers()).toEqual([]);
  });

  it('getMcpServer returns config by id', async () => {
    await saveMcpServer(makeConfig());
    const srv = await getMcpServer('srv1');
    expect(srv).not.toBeNull();
    expect(srv!.name).toBe('Test Server');
    expect(srv!.transport).toBe('stdio');
    expect(srv!.enabled).toBe(true);
    expect(srv!.command).toBe('/usr/bin/node');
    expect(srv!.args).toEqual(['server.js']);
    expect(srv!.env).toEqual({ NODE_ENV: 'test' });
  });

  it('getMcpServer returns null for non-existent', async () => {
    expect(await getMcpServer('nope')).toBeNull();
  });

  it('saveMcpServer upserts on conflict', async () => {
    await saveMcpServer(makeConfig({ name: 'Old Name' }));
    await saveMcpServer(makeConfig({ name: 'New Name', updated_at: 2000 }));
    const list = await getAllMcpServers();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('New Name');
    expect(list[0].updated_at).toBe(2000);
  });

  it('saveMcpServer stores SSE transport correctly', async () => {
    await saveMcpServer(makeConfig({
      transport: 'sse',
      command: undefined,
      args: [],
      url: 'http://localhost:3000/sse',
      headers: { Authorization: 'Bearer token' },
    }));
    const srv = await getMcpServer('srv1');
    expect(srv!.transport).toBe('sse');
    expect(srv!.url).toBe('http://localhost:3000/sse');
    expect(srv!.headers).toEqual({ Authorization: 'Bearer token' });
    expect(srv!.command).toBeUndefined();
  });

  it('saveMcpServer stores enabled=false as 0', async () => {
    await saveMcpServer(makeConfig({ enabled: false }));
    const srv = await getMcpServer('srv1');
    expect(srv!.enabled).toBe(false);
  });

  it('deleteMcpServer removes it', async () => {
    await saveMcpServer(makeConfig());
    await deleteMcpServer('srv1');
    expect(await getMcpServer('srv1')).toBeNull();
    expect(await getAllMcpServers()).toEqual([]);
  });

  it('deleteMcpServer is no-op for non-existent', async () => {
    await deleteMcpServer('nope');
    expect(await getAllMcpServers()).toEqual([]);
  });

  it('rowToConfig parses JSON fields correctly', async () => {
    // Insert with complex JSON to verify parsing
    await saveMcpServer(makeConfig({
      args: ['--port', '3000', '--verbose'],
      env: { PATH: '/usr/bin', HOME: '/root' },
      headers: { 'X-Custom': 'value' },
    }));
    const srv = await getMcpServer('srv1');
    expect(srv!.args).toEqual(['--port', '3000', '--verbose']);
    expect(srv!.env).toEqual({ PATH: '/usr/bin', HOME: '/root' });
    expect(srv!.headers).toEqual({ 'X-Custom': 'value' });
  });

  it('getAllMcpServers returns ordered by created_at', async () => {
    await saveMcpServer(makeConfig({ id: 'b', created_at: 2000 }));
    await saveMcpServer(makeConfig({ id: 'a', created_at: 1000 }));
    const list = await getAllMcpServers();
    expect(list[0].id).toBe('a');
    expect(list[1].id).toBe('b');
  });
});
