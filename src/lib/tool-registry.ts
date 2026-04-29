/**
 * Tool registry — 工具注册表，管理内置工具的注册和查询。
 * 镜像 plugin-registry.ts 的模式，支持 ConfigForm 和 createToolSpec 工厂函数。
 */
import type { Tool } from 'ai';
import type { ComponentType } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any, any>;

export interface ToolFormProps {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabledByDefault: boolean;
  defaultConfig: () => Record<string, unknown>;
  ConfigForm: ComponentType<ToolFormProps>;
  /** Factory that creates the AI SDK tool spec using the user's config. */
  createToolSpec: (config: Record<string, unknown>) => AnyTool;
}

const toolRegistry = new Map<string, ToolDefinition>();

export function registerTool(definition: ToolDefinition) {
  toolRegistry.set(definition.id, definition);
}

export function getTool(id: string): ToolDefinition | undefined {
  return toolRegistry.get(id);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(toolRegistry.values());
}

/**
 * Build the `tools` param for AI SDK from enabled tool IDs and their configs.
 */
export function buildToolsParam(
  enabledIds: string[],
  configMap: Map<string, Record<string, unknown>>,
): Record<string, AnyTool> | undefined {
  const tools: Record<string, AnyTool> = {};
  let count = 0;
  for (const id of enabledIds) {
    const def = toolRegistry.get(id);
    if (def) {
      const config = configMap.get(id) ?? def.defaultConfig();
      tools[def.id] = def.createToolSpec(config);
      count++;
    }
  }
  return count > 0 ? tools : undefined;
}
