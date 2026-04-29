export interface ShortcutAction {
  id: string;
  group: 'conversation' | 'message' | 'navigation';
  labelKey: string;
  descKey: string;
  defaultKey: string;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'newChat', group: 'conversation', labelKey: 'shortcuts.actions.newChat', descKey: 'shortcuts.actions.newChatDesc', defaultKey: 'mod+n' },
  { id: 'deleteChat', group: 'conversation', labelKey: 'shortcuts.actions.deleteChat', descKey: 'shortcuts.actions.deleteChatDesc', defaultKey: 'mod+backspace' },
  { id: 'searchChat', group: 'conversation', labelKey: 'shortcuts.actions.searchChat', descKey: 'shortcuts.actions.searchChatDesc', defaultKey: 'mod+k' },
  { id: 'prevChat', group: 'conversation', labelKey: 'shortcuts.actions.prevChat', descKey: 'shortcuts.actions.prevChatDesc', defaultKey: 'mod+arrowup' },
  { id: 'nextChat', group: 'conversation', labelKey: 'shortcuts.actions.nextChat', descKey: 'shortcuts.actions.nextChatDesc', defaultKey: 'mod+arrowdown' },
  { id: 'focusInput', group: 'message', labelKey: 'shortcuts.actions.focusInput', descKey: 'shortcuts.actions.focusInputDesc', defaultKey: 'mod+l' },
  { id: 'regenerate', group: 'message', labelKey: 'shortcuts.actions.regenerate', descKey: 'shortcuts.actions.regenerateDesc', defaultKey: 'mod+r' },
  { id: 'stopGeneration', group: 'message', labelKey: 'shortcuts.actions.stopGeneration', descKey: 'shortcuts.actions.stopGenerationDesc', defaultKey: 'escape' },
  { id: 'toggleSidebar', group: 'navigation', labelKey: 'shortcuts.actions.toggleSidebar', descKey: 'shortcuts.actions.toggleSidebarDesc', defaultKey: 'mod+s' },
  { id: 'openSettings', group: 'navigation', labelKey: 'shortcuts.actions.openSettings', descKey: 'shortcuts.actions.openSettingsDesc', defaultKey: 'mod+comma' },
];

export type ShortcutMap = Record<string, string>;

const DEFAULT_SHORTCUT_MAP: ShortcutMap = Object.fromEntries(
  SHORTCUT_ACTIONS.map((a) => [a.id, a.defaultKey]),
);

export function getDefaultShortcutMap(): ShortcutMap {
  return DEFAULT_SHORTCUT_MAP;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

const MAC_SYMBOLS: Record<string, string> = {
  mod: '⌘',
  shift: '⇧',
  alt: '⌥',
  ctrl: '⌃',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  escape: 'Esc',
  enter: '↵',
  comma: ',',
  period: '.',
  space: '空格',
};

const PC_LABELS: Record<string, string> = {
  mod: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  ctrl: 'Ctrl',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: 'Backspace',
  escape: 'Esc',
  enter: 'Enter',
  comma: ',',
  period: '.',
  space: 'Space',
};

export function formatShortcut(shortcut: string): string {
  const parts = shortcut.split('+');
  const labels = isMac ? MAC_SYMBOLS : PC_LABELS;
  return parts
    .map((p) => labels[p] ?? p.toUpperCase())
    .join(isMac ? '' : '+');
}

export function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = new Set(shortcut.split('+'));

  const needMod = parts.delete('mod');
  const needShift = parts.delete('shift');
  const needAlt = parts.delete('alt');
  const needCtrl = parts.delete('ctrl');

  const modKey = isMac ? e.metaKey : e.ctrlKey;
  if (needMod && !modKey) return false;
  if (!needMod && modKey) return false;

  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;

  if (isMac) {
    if (needCtrl !== e.ctrlKey) return false;
  }

  if (parts.size !== 1) return false;
  const key = parts.values().next().value as string;
  return e.key.toLowerCase() === key || e.code.toLowerCase() === `key${key}`;
}

export function shortcutToRecordKey(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;

  const parts: string[] = [];
  const modKey = isMac ? e.metaKey : e.ctrlKey;
  if (modKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  if (isMac && e.ctrlKey && !e.metaKey) parts.push('ctrl');

  let key = e.key.toLowerCase();
  if (key === ' ') key = 'space';
  else if (key === ',') key = 'comma';
  else if (key === '.') key = 'period';

  parts.push(key);
  return parts.join('+');
}
