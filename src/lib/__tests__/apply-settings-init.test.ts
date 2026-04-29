import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockGetAllSettings = vi.fn().mockResolvedValue({});
const mockListen = vi.fn().mockResolvedValue(vi.fn());
const mockSetNativeTheme = vi.fn().mockResolvedValue(undefined);
const mockConvertFileSrc = vi.fn((p: string) => `asset://${p}`);
const mockSetCodeTheme = vi.fn();

vi.mock('../dao/settings-dao', () => ({
  getAllSettings: (...args: unknown[]) => mockGetAllSettings(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));
vi.mock('@tauri-apps/api/app', () => ({
  setTheme: (...args: unknown[]) => mockSetNativeTheme(...args),
}));
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (p: string) => mockConvertFileSrc(p),
}));
vi.mock('../streamdown-plugins', () => ({
  setCodeTheme: (...args: unknown[]) => mockSetCodeTheme(...args),
}));
vi.mock('../../locales', () => ({
  default: { language: 'zh', changeLanguage: vi.fn() },
}));

// Global DOM setup
const styles: Record<string, string> = {};
const attrs: Record<string, string> = {};
const classList = new Set<string>();

const mockDocElement = {
  style: {
    setProperty: (k: string, v: string) => { styles[k] = v; },
    removeProperty: (k: string) => { delete styles[k]; },
  },
  classList: {
    contains: (c: string) => classList.has(c),
    toggle: (c: string, force: boolean) => { force ? classList.add(c) : classList.delete(c); },
  },
  setAttribute: (k: string, v: string) => { attrs[k] = v; },
  removeAttribute: (k: string) => { delete attrs[k]; },
};

// Set up document globally
Object.defineProperty(globalThis, 'document', {
  value: { documentElement: mockDocElement },
  writable: true,
  configurable: true,
});

const mockMatchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
});
Object.defineProperty(globalThis, 'matchMedia', { value: mockMatchMedia, writable: true, configurable: true });

const localStore: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => localStore[k], setItem: (k: string, v: string) => { localStore[k] = v; } },
  writable: true,
  configurable: true,
});

function clearDOM() {
  for (const k of Object.keys(styles)) delete styles[k];
  for (const k of Object.keys(attrs)) delete attrs[k];
  classList.clear();
}

describe('apply-settings initSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    clearDOM();
  });

  it('loads settings from DB and applies all', async () => {
    mockGetAllSettings.mockResolvedValueOnce({
      theme: 'dark',
      accent_color: 'green',
      font_size: 'large',
      line_height: 'relaxed',
      message_density: 'compact',
    });

    const { initSettings, getSettingValue } = await import('../apply-settings');
    await initSettings();

    expect(getSettingValue('theme')).toBe('dark');
    expect(getSettingValue('accent_color')).toBe('green');
    expect(styles['--chat-font-size']).toBe('16px');
    expect(styles['--chat-line-height']).toBe('1.875');
    expect(styles['--chat-message-gap']).toBe('1rem');
  });

  it('prevents duplicate initialization', async () => {
    mockGetAllSettings.mockResolvedValue({});
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    await initSettings();
    expect(mockGetAllSettings).toHaveBeenCalledTimes(1);
  });

  it('applies theme dark correctly', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ theme: 'dark' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(classList.has('dark')).toBe(true);
    expect(mockSetNativeTheme).toHaveBeenCalledWith('dark');
  });

  it('applies theme system with light preference', async () => {
    mockMatchMedia.mockReturnValue({ matches: false, addEventListener: vi.fn() });
    mockGetAllSettings.mockResolvedValueOnce({ theme: 'system' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(classList.has('dark')).toBe(false);
    expect(mockSetNativeTheme).toHaveBeenCalledWith(null);
  });

  it('applies accent color pink in light mode', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ accent_color: 'pink' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(styles['--color-accent']).toBe('#FF2D55');
    expect(styles['--color-accent-hover']).toBe('#E0264A');
  });

  it('applies dark accent color when theme is dark', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ theme: 'dark', accent_color: 'orange' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(styles['--color-accent']).toBe('#FF9F0A');
  });

  it('applies font family', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ font_family: 'Inter' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(styles['--chat-font-family']).toBe('"Inter", system-ui, sans-serif');
  });

  it('applies default font family when empty', async () => {
    mockGetAllSettings.mockResolvedValueOnce({});
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(styles['--chat-font-family']).toBe('system-ui, -apple-system, sans-serif');
  });

  it('applies code font', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ code_font: 'JetBrains Mono' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(styles['--code-font-family']).toBe('"JetBrains Mono", ui-monospace, monospace');
  });

  it('applies code theme', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ code_theme: 'monokai' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(mockSetCodeTheme).toHaveBeenCalledWith('monokai');
  });

  it('applies code word wrap on', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ code_word_wrap: '1' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(attrs['data-code-word-wrap']).toBe('on');
  });

  it('applies code word wrap off', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ code_word_wrap: '0' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(attrs['data-code-word-wrap']).toBe('off');
  });

  it('applies chat bg image preset', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ chat_bg_image: 'preset:aurora' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(styles['--chat-bg-image']).toContain('linear-gradient');
    expect(attrs['data-chat-bg']).toBe('');
  });

  it('applies chat bg image file path', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ chat_bg_image: '/path/to/image.jpg' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(styles['--chat-bg-image']).toContain('asset:///path/to/image.jpg');
  });

  it('removes chat bg when empty', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ chat_bg_image: '' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(styles['--chat-bg-image']).toBeUndefined();
    expect(attrs['data-chat-bg']).toBeUndefined();
  });

  it('applies chat bg blur and dimming', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ chat_bg_blur: '5', chat_bg_dimming: '50' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(styles['--chat-bg-blur']).toBe('5px');
    expect(styles['--chat-bg-dimming']).toBe('0.5');
  });

  it('applies bubble style and opacity', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ chat_bubble_style: 'rounded', chat_bubble_opacity: '60' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(attrs['data-bubble-style']).toBe('rounded');
    expect(styles['--chat-bubble-opacity']).toBe('0.6');
  });

  it('applies border radius', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ chat_border_radius: '8' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    expect(styles['--chat-border-radius']).toBe('8px');
  });

  it('notifies setting listeners after init', async () => {
    mockGetAllSettings.mockResolvedValueOnce({});
    const { initSettings, subscribeSettings } = await import('../apply-settings');
    const listener = vi.fn();
    subscribeSettings(listener);
    await initSettings();
    expect(listener).toHaveBeenCalled();
  });

  it('handles settings-changed event', async () => {
    mockGetAllSettings.mockResolvedValueOnce({});
    let settingsChangedCallback: ((evt: { payload: { key: string; value: string } }) => void) | null = null;
    mockListen.mockImplementation((event: string, cb: (...a: unknown[]) => void) => {
      if (event === 'settings-changed') settingsChangedCallback = cb as typeof settingsChangedCallback;
      return Promise.resolve(vi.fn());
    });

    const { initSettings, getSettingValue } = await import('../apply-settings');
    await initSettings();

    settingsChangedCallback!({ payload: { key: 'font_size', value: 'small' } });
    expect(getSettingValue('font_size')).toBe('small');
    expect(styles['--chat-font-size']).toBe('13px');
  });

  it('syncs i18n language from settings', async () => {
    mockGetAllSettings.mockResolvedValueOnce({ language: 'en' });
    const { initSettings } = await import('../apply-settings');
    await initSettings();
    const i18n = (await import('../../locales')).default;
    expect(i18n.changeLanguage).toHaveBeenCalledWith('en');
  });
});

describe('resolveChatBgImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns empty for falsy value', async () => {
    const { resolveChatBgImage } = await import('../apply-settings');
    expect(resolveChatBgImage('')).toBe('');
  });

  it('resolves preset background', async () => {
    const { resolveChatBgImage } = await import('../apply-settings');
    const result = resolveChatBgImage('preset:ocean-blue');
    expect(result).toContain('linear-gradient');
  });

  it('returns empty for unknown preset', async () => {
    const { resolveChatBgImage } = await import('../apply-settings');
    expect(resolveChatBgImage('preset:nonexistent')).toBe('');
  });

  it('converts file path to url()', async () => {
    const { resolveChatBgImage } = await import('../apply-settings');
    const result = resolveChatBgImage('/path/to/bg.jpg');
    expect(result).toContain('url(');
    expect(result).toContain('asset:///path/to/bg.jpg');
  });
});
