import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAllSettings = vi.fn().mockResolvedValue({});
const mockListen = vi.fn().mockResolvedValue(vi.fn());
const mockSetNativeTheme = vi.fn().mockResolvedValue(undefined);
const mockConvertFileSrc = vi.fn((p: string) => `asset://${p}`);
const mockSetCodeTheme = vi.fn();
const mockChangeLanguage = vi.fn();

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
  default: { language: 'zh', changeLanguage: (...args: unknown[]) => mockChangeLanguage(...args) },
}));

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

Object.defineProperty(globalThis, 'document', {
  value: { documentElement: mockDocElement },
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'matchMedia', {
  value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: vi.fn() },
  writable: true,
  configurable: true,
});

function clearDOM() {
  for (const k of Object.keys(styles)) delete styles[k];
  for (const k of Object.keys(attrs)) delete attrs[k];
  classList.clear();
}

describe('settings-changed event handler — all keys', () => {
  let settingsChangedCallback: ((evt: { payload: { key: string; value: string } }) => void) | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    clearDOM();
    settingsChangedCallback = null;

    mockGetAllSettings.mockResolvedValueOnce({});
    mockListen.mockImplementation((event: string, cb: (...a: unknown[]) => void) => {
      if (event === 'settings-changed') settingsChangedCallback = cb as typeof settingsChangedCallback;
      return Promise.resolve(vi.fn());
    });

    const { initSettings } = await import('../apply-settings');
    await initSettings();
  });

  function fire(key: string, value: string) {
    settingsChangedCallback!({ payload: { key, value } });
  }

  it('handles accent_color change', () => {
    fire('accent_color', 'green');
    expect(styles['--color-accent']).toBeDefined();
  });

  it('handles font_family change', () => {
    fire('font_family', 'Inter');
    expect(styles['--chat-font-family']).toContain('Inter');
  });

  it('handles code_font change', () => {
    fire('code_font', 'Fira Code');
    expect(styles['--code-font-family']).toContain('Fira Code');
  });

  it('handles line_height change', () => {
    fire('line_height', 'compact');
    expect(styles['--chat-line-height']).toBe('1.4');
  });

  it('handles message_density change', () => {
    fire('message_density', 'spacious');
    expect(styles['--chat-message-gap']).toBe('3rem');
  });

  it('handles code_theme change', () => {
    fire('code_theme', 'dracula');
    expect(mockSetCodeTheme).toHaveBeenCalledWith('dracula');
    expect(attrs['data-code-theme']).toBe('dracula');
  });

  it('handles code_word_wrap change', () => {
    fire('code_word_wrap', '1');
    expect(attrs['data-code-word-wrap']).toBe('on');
  });

  it('handles chat_bg_image change with preset', () => {
    fire('chat_bg_image', 'preset:aurora');
    expect(styles['--chat-bg-image']).toContain('linear-gradient');
    expect(attrs['data-chat-bg']).toBe('');
  });

  it('handles chat_bg_image change with empty value', () => {
    fire('chat_bg_image', 'preset:aurora');
    fire('chat_bg_image', '');
    expect(styles['--chat-bg-image']).toBeUndefined();
    expect(attrs['data-chat-bg']).toBeUndefined();
  });

  it('handles chat_bg_blur change', () => {
    fire('chat_bg_blur', '10');
    expect(styles['--chat-bg-blur']).toBe('10px');
  });

  it('handles chat_bg_dimming change', () => {
    fire('chat_bg_dimming', '50');
    expect(styles['--chat-bg-dimming']).toBe('0.5');
  });

  it('handles chat_bubble_style change', () => {
    fire('chat_bubble_style', 'rounded');
    expect(attrs['data-bubble-style']).toBe('rounded');
  });

  it('handles chat_bubble_opacity change', () => {
    fire('chat_bubble_opacity', '60');
    expect(styles['--chat-bubble-opacity']).toBe('0.6');
  });

  it('handles chat_border_radius change', () => {
    fire('chat_border_radius', '12');
    expect(styles['--chat-border-radius']).toBe('12px');
  });

  it('handles language change', () => {
    fire('language', 'en');
    expect(mockChangeLanguage).toHaveBeenCalledWith('en');
  });

  it('handles theme change to dark', () => {
    fire('theme', 'dark');
    expect(classList.has('dark')).toBe(true);
  });

  it('notifies listeners on settings-changed', async () => {
    const { subscribeSettings } = await import('../apply-settings');
    const listener = vi.fn();
    subscribeSettings(listener);
    listener.mockClear();

    fire('font_size', 'large');
    expect(listener).toHaveBeenCalled();
  });
});
