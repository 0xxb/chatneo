import { describe, it, expect, vi } from 'vitest';

vi.mock('../dao/settings-dao', () => ({
  getAllSettings: vi.fn().mockResolvedValue({}),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock('@tauri-apps/api/app', () => ({
  setTheme: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));
vi.mock('../../locales', () => ({
  default: { language: 'zh-CN', changeLanguage: vi.fn() },
}));
vi.mock('../streamdown-plugins', () => ({
  setCodeTheme: vi.fn(),
}));

import { resolveChatBgImage, PRESET_BACKGROUNDS, getSettingValue, subscribeSettings, getSettingSnapshot } from '../apply-settings';

describe('apply-settings', () => {
  describe('resolveChatBgImage', () => {
    it('returns empty for empty value', () => {
      expect(resolveChatBgImage('')).toBe('');
    });

    it('resolves preset backgrounds', () => {
      expect(resolveChatBgImage('preset:warm-sunset')).toBe(PRESET_BACKGROUNDS['warm-sunset']);
      expect(resolveChatBgImage('preset:ocean-blue')).toBe(PRESET_BACKGROUNDS['ocean-blue']);
    });

    it('returns empty for unknown preset', () => {
      expect(resolveChatBgImage('preset:nonexistent')).toBe('');
    });

    it('resolves file path to url()', () => {
      const result = resolveChatBgImage('/path/to/image.png');
      expect(result).toBe('url("asset://localhost//path/to/image.png")');
    });
  });

  describe('PRESET_BACKGROUNDS', () => {
    it('has all 8 presets', () => {
      expect(Object.keys(PRESET_BACKGROUNDS)).toHaveLength(8);
      expect(PRESET_BACKGROUNDS['warm-sunset']).toContain('linear-gradient');
      expect(PRESET_BACKGROUNDS['night-sky']).toContain('linear-gradient');
    });
  });

  describe('subscribeSettings', () => {
    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = subscribeSettings(listener);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('getSettingSnapshot', () => {
    it('returns settings object', () => {
      const snapshot = getSettingSnapshot();
      expect(typeof snapshot).toBe('object');
    });
  });

  describe('getSettingValue', () => {
    it('returns undefined for non-existent key', () => {
      expect(getSettingValue('nonexistent_key_xyz')).toBeUndefined();
    });
  });
});
