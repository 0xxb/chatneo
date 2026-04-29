import { describe, it, expect, beforeEach } from 'vitest';
import { registerPlugin, getPlugin, getAllPlugins, type PluginDefinition } from '../plugin-registry';

function createMockPlugin(id: string): PluginDefinition {
  return {
    id,
    name: `Plugin ${id}`,
    description: `Description for ${id}`,
    icon: '🔌',
    defaultConfig: () => ({ enabled: true }),
    ConfigForm: () => null,
    hooks: {},
  };
}

describe('plugin-registry', () => {
  beforeEach(() => {
    // Register test plugins
    registerPlugin(createMockPlugin('plugin-a'));
    registerPlugin(createMockPlugin('plugin-b'));
  });

  describe('registerPlugin', () => {
    it('registers a plugin that can be retrieved', () => {
      const def = createMockPlugin('test-plugin');
      registerPlugin(def);
      expect(getPlugin('test-plugin')).toBe(def);
    });

    it('overwrites existing plugin with same id', () => {
      const def1 = createMockPlugin('dup-plugin');
      const def2 = createMockPlugin('dup-plugin');
      def2.name = 'Updated Plugin';
      registerPlugin(def1);
      registerPlugin(def2);
      expect(getPlugin('dup-plugin')?.name).toBe('Updated Plugin');
    });
  });

  describe('getPlugin', () => {
    it('returns undefined for non-existent id', () => {
      expect(getPlugin('non-existent')).toBeUndefined();
    });

    it('returns the registered plugin', () => {
      expect(getPlugin('plugin-a')).toBeDefined();
      expect(getPlugin('plugin-a')?.id).toBe('plugin-a');
    });
  });

  describe('getAllPlugins', () => {
    it('returns array of all registered plugins', () => {
      const all = getAllPlugins();
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all.some((p) => p.id === 'plugin-a')).toBe(true);
      expect(all.some((p) => p.id === 'plugin-b')).toBe(true);
    });

    it('returns a new array on each call', () => {
      const a = getAllPlugins();
      const b = getAllPlugins();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('defaultConfig', () => {
    it('each call returns a fresh object', () => {
      const plugin = getPlugin('plugin-a')!;
      const c1 = plugin.defaultConfig();
      const c2 = plugin.defaultConfig();
      expect(c1).toEqual(c2);
      expect(c1).not.toBe(c2);
    });
  });
});
