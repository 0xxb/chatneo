/**
 * Plugin runtime — 非 React 运行时辅助，供 chat store（Zustand）调用。
 */
import * as pluginDao from './dao/plugin-dao';
import { safeJsonParse } from './utils';
import { getAllPlugins, getPlugin } from './plugin-registry';
import { listen } from '@tauri-apps/api/event';
import type { OnResponseReceivedContext } from './plugin-registry';
import { logger } from './logger';

// --- Sync enabled-state cache ---

const enabledCache = new Map<string, boolean>();

async function syncEnabledCache() {
  const rows = await pluginDao.listPlugins();
  enabledCache.clear();
  for (const r of rows) enabledCache.set(r.id, r.enabled === 1);
}

// Initial sync + listen for changes (with error handling)
syncEnabledCache().catch((e) => logger.warn('plugin', `插件缓存初始化失败: ${e}`));
listen('plugins-changed', () => syncEnabledCache().catch((e) => logger.warn('plugin', `插件缓存同步失败: ${e}`)));

/** Synchronously check if a plugin is enabled (from cache). Defaults to true if never persisted. */
export function isPluginEnabled(id: string): boolean {
  return enabledCache.get(id) ?? true;
}

export async function getPluginConfig(id: string): Promise<{ enabled: boolean; config: Record<string, unknown> }> {
  const row = await pluginDao.getPluginById(id);
  if (row) {
    return { enabled: row.enabled === 1, config: safeJsonParse<Record<string, unknown>>(row.config, {}) };
  }
  // Not in DB yet — use defaults from registry
  const def = getPlugin(id);
  return { enabled: true, config: def?.defaultConfig() ?? {} };
}

export async function dispatchOnResponseReceived(ctx: OnResponseReceivedContext): Promise<void> {
  const plugins = getAllPlugins();
  for (const plugin of plugins) {
    if (!plugin.hooks.onResponseReceived) continue;
    const { enabled, config } = await getPluginConfig(plugin.id);
    if (!enabled) continue;
    try {
      await plugin.hooks.onResponseReceived(ctx, config);
      logger.info('plugin', `插件 ${plugin.id} onResponseReceived 执行成功`);
    } catch (e) {
      logger.warn('plugin', `插件 ${plugin.id} onResponseReceived 执行失败: ${e}`);
    }
  }
}
