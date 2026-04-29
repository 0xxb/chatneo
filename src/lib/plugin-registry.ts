/**
 * Plugin registry — 纯数据模块，无任何外部依赖，作为依赖图的叶子节点。
 * 插件定义和 hooks 的注册/获取都通过此模块。
 */
import type { ComponentType } from 'react';

// --- Hook context types ---

export interface OnResponseReceivedContext {
  conversationId: string;
  conversation: {
    id: string;
    title: string;
    provider_id: number | null;
    model_id: string;
    summary: string;
  };
  messages: { role: string; content: string }[];
  assistantMessage: string;
  userMessage: string;
}

// --- Plugin definition ---

export interface PluginHooks {
  onResponseReceived?: (ctx: OnResponseReceivedContext, config: Record<string, unknown>) => Promise<void>;
}

export interface PluginFormProps {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
}

export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultConfig: () => Record<string, unknown>;
  ConfigForm: ComponentType<PluginFormProps>;
  hooks: PluginHooks;
}

// --- Registry ---

const pluginRegistry = new Map<string, PluginDefinition>();

export function registerPlugin(definition: PluginDefinition) {
  pluginRegistry.set(definition.id, definition);
}

export function getPlugin(id: string): PluginDefinition | undefined {
  return pluginRegistry.get(id);
}

export function getAllPlugins(): PluginDefinition[] {
  return Array.from(pluginRegistry.values());
}
