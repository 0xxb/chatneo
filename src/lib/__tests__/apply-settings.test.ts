import { describe, it, expect, vi } from 'vitest';

vi.mock('../dao/settings-dao', () => ({
  getAllSettings: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('@tauri-apps/api/app', () => ({
  setTheme: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
}));

vi.mock('../../locales', () => ({
  default: { language: 'zh', changeLanguage: vi.fn() },
}));

vi.mock('../streamdown-plugins', () => ({
  setCodeTheme: vi.fn(),
}));

import { resolveChatBgImage, PRESET_BACKGROUNDS } from '../apply-settings';

describe('resolveChatBgImage', () => {
  it('returns empty string for empty value', () => {
    expect(resolveChatBgImage('')).toBe('');
  });

  it('resolves preset background', () => {
    const result = resolveChatBgImage('preset:warm-sunset');
    expect(result).toBe(PRESET_BACKGROUNDS['warm-sunset']);
    expect(result).toContain('linear-gradient');
  });

  it('returns empty string for unknown preset', () => {
    expect(resolveChatBgImage('preset:nonexistent')).toBe('');
  });

  it('resolves file path to asset URL', () => {
    const result = resolveChatBgImage('/path/to/image.jpg');
    expect(result).toContain('url(');
    expect(result).toContain('asset://localhost//path/to/image.jpg');
  });

  it('handles all preset keys', () => {
    for (const key of Object.keys(PRESET_BACKGROUNDS)) {
      const result = resolveChatBgImage(`preset:${key}`);
      expect(result).toContain('linear-gradient');
    }
  });
});
