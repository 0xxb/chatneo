import { describe, it, expect, beforeEach } from 'vitest';
import { registerTool, getTool, getAllTools, buildToolsParam, type ToolDefinition } from '../tool-registry';

function createMockToolDef(id: string, enabledByDefault = true): ToolDefinition {
  return {
    id,
    name: `Tool ${id}`,
    description: `Description for ${id}`,
    icon: '🔧',
    enabledByDefault,
    defaultConfig: () => ({ key: 'default' }),
    ConfigForm: () => null,
    createToolSpec: (config) => ({
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ config }),
    }) as any,
  };
}

describe('tool-registry', () => {
  beforeEach(() => {
    // Register some tools for testing
    registerTool(createMockToolDef('tool-a'));
    registerTool(createMockToolDef('tool-b'));
    registerTool(createMockToolDef('tool-c', false));
  });

  describe('registerTool', () => {
    it('registers a tool that can be retrieved', () => {
      const def = createMockToolDef('test-register');
      registerTool(def);
      expect(getTool('test-register')).toBe(def);
    });

    it('overwrites existing tool with same id', () => {
      const def1 = createMockToolDef('dup');
      const def2 = createMockToolDef('dup');
      def2.name = 'Updated';
      registerTool(def1);
      registerTool(def2);
      expect(getTool('dup')?.name).toBe('Updated');
    });
  });

  describe('getTool', () => {
    it('returns undefined for non-existent id', () => {
      expect(getTool('non-existent')).toBeUndefined();
    });

    it('returns the registered tool', () => {
      expect(getTool('tool-a')).toBeDefined();
      expect(getTool('tool-a')?.id).toBe('tool-a');
    });
  });

  describe('getAllTools', () => {
    it('returns array of all registered tools', () => {
      const all = getAllTools();
      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(all.some((t) => t.id === 'tool-a')).toBe(true);
      expect(all.some((t) => t.id === 'tool-b')).toBe(true);
    });
  });

  describe('buildToolsParam', () => {
    it('builds tools param from enabled IDs', () => {
      const configMap = new Map<string, Record<string, unknown>>();
      configMap.set('tool-a', { key: 'custom' });

      const result = buildToolsParam(['tool-a'], configMap);
      expect(result).toBeDefined();
      expect(result!['tool-a']).toBeDefined();
    });

    it('returns undefined when no tools are enabled', () => {
      const result = buildToolsParam([], new Map());
      expect(result).toBeUndefined();
    });

    it('returns undefined when enabled IDs do not match any registered tool', () => {
      const result = buildToolsParam(['non-existent'], new Map());
      expect(result).toBeUndefined();
    });

    it('uses defaultConfig when configMap has no entry', () => {
      const result = buildToolsParam(['tool-a'], new Map());
      expect(result).toBeDefined();
      expect(result!['tool-a']).toBeDefined();
    });

    it('builds multiple tools', () => {
      const configMap = new Map<string, Record<string, unknown>>();
      const result = buildToolsParam(['tool-a', 'tool-b'], configMap);
      expect(result).toBeDefined();
      expect(Object.keys(result!)).toHaveLength(2);
    });
  });
});
