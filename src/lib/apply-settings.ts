import { getAllSettings } from './dao/settings-dao';
import { listen } from '@tauri-apps/api/event';
import { setTheme as setNativeTheme } from '@tauri-apps/api/app';
import { convertFileSrc } from '@tauri-apps/api/core';
import i18n from '../locales';
import { setCodeTheme } from './streamdown-plugins';

const ACCENT_COLORS: Record<string, { light: string; dark: string; lightHover: string; darkHover: string }> = {
  default: { light: '#007AFF', dark: '#0A84FF', lightHover: '#0066DD', darkHover: '#409CFF' },
  orange:  { light: '#FF9500', dark: '#FF9F0A', lightHover: '#E08600', darkHover: '#FFB340' },
  yellow:  { light: '#FFCC00', dark: '#FFD60A', lightHover: '#E0B400', darkHover: '#FFE040' },
  green:   { light: '#34C759', dark: '#30D158', lightHover: '#2DB14E', darkHover: '#5ADE7F' },
  blue:    { light: '#007AFF', dark: '#0A84FF', lightHover: '#0066DD', darkHover: '#409CFF' },
  pink:    { light: '#FF2D55', dark: '#FF375F', lightHover: '#E0264A', darkHover: '#FF6082' },
};

const FONT_SIZES: Record<string, string> = {
  small: '13px',
  medium: '14px',
  large: '16px',
};

const LINE_HEIGHTS: Record<string, string> = {
  compact: '1.4',
  standard: '1.625',
  relaxed: '1.875',
};

const MESSAGE_GAPS: Record<string, string> = {
  compact: '1rem',
  standard: '2rem',
  spacious: '3rem',
};

const PRESET_BACKGROUNDS: Record<string, string> = {
  'warm-sunset': 'linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #ffd452 100%)',
  'ocean-blue': 'linear-gradient(135deg, #667eea 0%, #764ba2 30%, #6B8DD6 70%, #8E37D7 100%)',
  'forest-green': 'linear-gradient(135deg, #11998e 0%, #38ef7d 50%, #2d9a6e 100%)',
  'lavender-mist': 'linear-gradient(135deg, #c3cfe2 0%, #d5b6e0 50%, #f0c9cf 100%)',
  'aurora': 'linear-gradient(135deg, #00c9ff 0%, #92fe9d 30%, #00c9ff 60%, #f0f 100%)',
  'night-sky': 'linear-gradient(135deg, #0c0c2e 0%, #1a1a4e 30%, #2d1b69 60%, #0c0c2e 100%)',
  'rose-gold': 'linear-gradient(135deg, #f4c4d0 0%, #d4a0a0 50%, #e8b4b8 100%)',
  'minimal-gray': 'linear-gradient(135deg, #e0e0e0 0%, #c9c9c9 50%, #d5d5d5 100%)',
};

export { PRESET_BACKGROUNDS };

/** Resolve a chat_bg_image setting value to a CSS background value */
export function resolveChatBgImage(value: string): string {
  if (!value) return '';
  if (value.startsWith('preset:')) return PRESET_BACKGROUNDS[value.slice(7)] ?? '';
  return `url("${convertFileSrc(value)}")`;
}

const settings: Record<string, string> = {};

export function getSettingValue(key: string): string | undefined {
  return settings[key];
}

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

function applyTheme(theme: string) {
  const html = document.documentElement;
  const shouldBeDark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme:dark)').matches);

  html.classList.toggle('dark', shouldBeDark);
  localStorage.setItem('chatneo-theme', theme);

  // Sync native window theme so windowEffects (vibrancy) follows the app theme
  setNativeTheme(theme === 'system' ? null : (shouldBeDark ? 'dark' : 'light'));

  // Re-apply accent color when theme changes (light/dark have different values)
  if (settings['accent_color']) {
    applyAccentColor(settings['accent_color']);
  }
}

function applyAccentColor(color: string) {
  const palette = ACCENT_COLORS[color] ?? ACCENT_COLORS.default;
  const dark = isDark();
  const value = dark ? palette.dark : palette.light;
  const hover = dark ? palette.darkHover : palette.lightHover;
  const style = document.documentElement.style;
  style.setProperty('--color-accent', value);
  style.setProperty('--color-accent-hover', hover);
  style.setProperty('--color-focus-ring', value + '66');
  style.setProperty('--color-primary', value);
}

function applyFontSize(size: string) {
  const px = FONT_SIZES[size] ?? FONT_SIZES.medium;
  document.documentElement.style.setProperty('--chat-font-size', px);
}

function applyFontFamily(font: string) {
  const value = font ? `"${font}", system-ui, sans-serif` : 'system-ui, -apple-system, sans-serif';
  document.documentElement.style.setProperty('--chat-font-family', value);
}

function applyCodeFont(font: string) {
  const value = font ? `"${font}", ui-monospace, monospace` : 'ui-monospace, SFMono-Regular, Menlo, monospace';
  document.documentElement.style.setProperty('--code-font-family', value);
}

function applyLineHeight(height: string) {
  const value = LINE_HEIGHTS[height] ?? LINE_HEIGHTS.standard;
  document.documentElement.style.setProperty('--chat-line-height', value);
}

function applyMessageDensity(density: string) {
  const value = MESSAGE_GAPS[density] ?? MESSAGE_GAPS.standard;
  document.documentElement.style.setProperty('--chat-message-gap', value);
}

function applyCodeTheme(theme: string) {
  document.documentElement.setAttribute('data-code-theme', theme || 'auto');
  setCodeTheme(theme || 'auto');
}

function applyCodeWordWrap(enabled: string) {
  document.documentElement.setAttribute('data-code-word-wrap', enabled === '1' ? 'on' : 'off');
}

function applyChatBgImage(value: string) {
  const style = document.documentElement.style;
  const html = document.documentElement;
  const resolved = resolveChatBgImage(value);
  if (!resolved) {
    style.removeProperty('--chat-bg-image');
    html.removeAttribute('data-chat-bg');
    return;
  }
  html.setAttribute('data-chat-bg', '');
  style.setProperty('--chat-bg-image', resolved);
}

function applyChatBgBlur(value: string) {
  document.documentElement.style.setProperty('--chat-bg-blur', `${value || '0'}px`);
}

function applyChatBgDimming(value: string) {
  const v = parseInt(value || '30', 10) / 100;
  document.documentElement.style.setProperty('--chat-bg-dimming', String(v));
}

function applyChatBubbleStyle(value: string) {
  document.documentElement.setAttribute('data-bubble-style', value || 'flat');
}

function applyChatBubbleOpacity(value: string) {
  const v = parseInt(value || '80', 10) / 100;
  document.documentElement.style.setProperty('--chat-bubble-opacity', String(v));
}

function applyChatBorderRadius(value: string) {
  document.documentElement.style.setProperty('--chat-border-radius', `${value || '16'}px`);
}

function applyAll() {
  applyTheme(settings['theme'] ?? 'system');
  applyAccentColor(settings['accent_color'] ?? 'default');
  applyFontSize(settings['font_size'] ?? 'medium');
  applyFontFamily(settings['font_family'] ?? '');
  applyCodeFont(settings['code_font'] ?? '');
  applyLineHeight(settings['line_height'] ?? 'standard');
  applyMessageDensity(settings['message_density'] ?? 'standard');
  applyCodeTheme(settings['code_theme'] ?? 'auto');
  applyCodeWordWrap(settings['code_word_wrap'] ?? '0');
  applyChatBgImage(settings['chat_bg_image'] ?? '');
  applyChatBgBlur(settings['chat_bg_blur'] ?? '0');
  applyChatBgDimming(settings['chat_bg_dimming'] ?? '30');
  applyChatBubbleStyle(settings['chat_bubble_style'] ?? 'flat');
  applyChatBubbleOpacity(settings['chat_bubble_opacity'] ?? '80');
  applyChatBorderRadius(settings['chat_border_radius'] ?? '16');
}

// Subscribers for reactive setting reads (useSyncExternalStore)
type SettingListener = () => void;
const settingListeners = new Set<SettingListener>();
function notifySettingListeners() { settingListeners.forEach((fn) => fn()); }
export function subscribeSettings(listener: SettingListener) {
  settingListeners.add(listener);
  return () => { settingListeners.delete(listener); };
}
export function getSettingSnapshot() { return settings; }

let initialized = false;

export async function initSettings() {
  // Guard against duplicate initialization (prevents listener accumulation)
  if (initialized) return;
  initialized = true;

  // Load from DB
  const rows = await getAllSettings();
  for (const [key, value] of Object.entries(rows)) {
    settings[key] = value;
  }

  applyAll();
  // Let subscribers (e.g. useMessageInputState) re-read once cache is ready.
  notifySettingListeners();

  // Sync i18n language from DB (DB is the source of truth, not localStorage)
  if (settings['language'] && settings['language'] !== i18n.language) {
    i18n.changeLanguage(settings['language']);
  }

  // Listen for OS theme changes when theme is "system"
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => {
    if ((settings['theme'] ?? 'system') === 'system') {
      applyTheme('system');
    }
  });

  // Listen for cross-window settings changes
  listen<{ key: string; value: string }>('settings-changed', ({ payload }) => {
    settings[payload.key] = payload.value;
    notifySettingListeners();
    switch (payload.key) {
      case 'theme':
        applyTheme(payload.value);
        break;
      case 'accent_color':
        applyAccentColor(payload.value);
        break;
      case 'font_size':
        applyFontSize(payload.value);
        break;
      case 'font_family':
        applyFontFamily(payload.value);
        break;
      case 'code_font':
        applyCodeFont(payload.value);
        break;
      case 'line_height':
        applyLineHeight(payload.value);
        break;
      case 'message_density':
        applyMessageDensity(payload.value);
        break;
      case 'code_theme':
        applyCodeTheme(payload.value);
        break;
      case 'code_word_wrap':
        applyCodeWordWrap(payload.value);
        break;
      case 'chat_bg_image':
        applyChatBgImage(payload.value);
        break;
      case 'chat_bg_blur':
        applyChatBgBlur(payload.value);
        break;
      case 'chat_bg_dimming':
        applyChatBgDimming(payload.value);
        break;
      case 'chat_bubble_style':
        applyChatBubbleStyle(payload.value);
        break;
      case 'chat_bubble_opacity':
        applyChatBubbleOpacity(payload.value);
        break;
      case 'chat_border_radius':
        applyChatBorderRadius(payload.value);
        break;
      case 'language':
        i18n.changeLanguage(payload.value);
        break;
    }
  });
}
