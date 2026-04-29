import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListPlugins = vi.fn().mockResolvedValue([]);
const mockGetPluginById = vi.fn().mockResolvedValue(null);

vi.mock('../dao/plugin-dao', () => ({
  listPlugins: (...args: unknown[]) => mockListPlugins(...args),
  getPluginById: (...args: unknown[]) => mockGetPluginById(...args),
}));

const mockGetAllPlugins = vi.fn().mockReturnValue([]);
const mockGetPlugin = vi.fn().mockReturnValue(undefined);

vi.mock('../plugin-registry', () => ({
  getAllPlugins: () => mockGetAllPlugins(),
  getPlugin: (id: string) => mockGetPlugin(id),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { isPluginEnabled, getPluginConfig, dispatchOnResponseReceived } from '../plugin-runtime';
import type { OnResponseReceivedContext } from '../plugin-registry';

function makeCtx(overrides: Partial<OnResponseReceivedContext> = {}): OnResponseReceivedContext {
  return {
    conversationId: 'conv1',
    conversation: { id: 'conv1', title: '测试', provider_id: -2, model_id: 'gpt-4', summary: '' },
    messages: [{ role: 'user', content: '你好' }],
    assistantMessage: '你好！',
    userMessage: '你好',
    ...overrides,
  };
}

describe('plugin-runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isPluginEnabled', () => {
    it('defaults to true for unknown plugins', () => {
      expect(isPluginEnabled('unknown-plugin')).toBe(true);
    });
  });

  describe('getPluginConfig', () => {
    it('returns DB config when plugin exists in DB', async () => {
      mockGetPluginById.mockResolvedValueOnce({
        id: 'p1', enabled: 1, config: '{"maxLength":50}',
      });
      const result = await getPluginConfig('p1');
      expect(result.enabled).toBe(true);
      expect(result.config).toEqual({ maxLength: 50 });
    });

    it('returns disabled state from DB', async () => {
      mockGetPluginById.mockResolvedValueOnce({
        id: 'p1', enabled: 0, config: '{}',
      });
      const result = await getPluginConfig('p1');
      expect(result.enabled).toBe(false);
    });

    it('returns defaults from registry when not in DB', async () => {
      mockGetPluginById.mockResolvedValueOnce(null);
      mockGetPlugin.mockReturnValueOnce({
        id: 'p1',
        defaultConfig: () => ({ key: 'default' }),
      });
      const result = await getPluginConfig('p1');
      expect(result.enabled).toBe(true);
      expect(result.config).toEqual({ key: 'default' });
    });

    it('returns empty config when not in DB and not in registry', async () => {
      mockGetPluginById.mockResolvedValueOnce(null);
      mockGetPlugin.mockReturnValueOnce(undefined);
      const result = await getPluginConfig('nonexistent');
      expect(result.enabled).toBe(true);
      expect(result.config).toEqual({});
    });
  });

  describe('dispatchOnResponseReceived', () => {
    it('calls enabled plugins with onResponseReceived hook', async () => {
      const hookFn = vi.fn().mockResolvedValue(undefined);
      mockGetAllPlugins.mockReturnValue([
        { id: 'p1', hooks: { onResponseReceived: hookFn } },
      ]);
      mockGetPluginById.mockResolvedValueOnce({ id: 'p1', enabled: 1, config: '{"k":"v"}' });

      const ctx = makeCtx();
      await dispatchOnResponseReceived(ctx);

      expect(hookFn).toHaveBeenCalledWith(ctx, { k: 'v' });
    });

    it('skips disabled plugins', async () => {
      const hookFn = vi.fn();
      mockGetAllPlugins.mockReturnValue([
        { id: 'p1', hooks: { onResponseReceived: hookFn } },
      ]);
      mockGetPluginById.mockResolvedValueOnce({ id: 'p1', enabled: 0, config: '{}' });

      await dispatchOnResponseReceived(makeCtx());

      expect(hookFn).not.toHaveBeenCalled();
    });

    it('skips plugins without onResponseReceived hook', async () => {
      mockGetAllPlugins.mockReturnValue([
        { id: 'p1', hooks: {} },
      ]);

      await dispatchOnResponseReceived(makeCtx());
      // No error thrown
    });

    it('isolates errors between plugins', async () => {
      const hookFn1 = vi.fn().mockRejectedValue(new Error('plugin crash'));
      const hookFn2 = vi.fn().mockResolvedValue(undefined);
      mockGetAllPlugins.mockReturnValue([
        { id: 'p1', hooks: { onResponseReceived: hookFn1 } },
        { id: 'p2', hooks: { onResponseReceived: hookFn2 } },
      ]);
      mockGetPluginById
        .mockResolvedValueOnce({ id: 'p1', enabled: 1, config: '{}' })
        .mockResolvedValueOnce({ id: 'p2', enabled: 1, config: '{}' });

      await dispatchOnResponseReceived(makeCtx());

      expect(hookFn1).toHaveBeenCalled();
      expect(hookFn2).toHaveBeenCalled();
    });

    it('dispatches to multiple enabled plugins in order', async () => {
      const order: string[] = [];
      const hook1 = vi.fn().mockImplementation(async () => { order.push('p1'); });
      const hook2 = vi.fn().mockImplementation(async () => { order.push('p2'); });
      mockGetAllPlugins.mockReturnValue([
        { id: 'p1', hooks: { onResponseReceived: hook1 } },
        { id: 'p2', hooks: { onResponseReceived: hook2 } },
      ]);
      mockGetPluginById
        .mockResolvedValueOnce({ id: 'p1', enabled: 1, config: '{}' })
        .mockResolvedValueOnce({ id: 'p2', enabled: 1, config: '{}' });

      await dispatchOnResponseReceived(makeCtx());

      expect(order).toEqual(['p1', 'p2']);
    });
  });
});
