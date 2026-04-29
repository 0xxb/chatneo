import { describe, it, expect, vi, beforeAll } from 'vitest';

const navigatorSpy = vi.spyOn(globalThis, 'navigator', 'get');

/** Create a minimal KeyboardEvent-like object for Node environment */
function mockKeyEvent(init: {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}) {
  return {
    key: init.key,
    code: init.code ?? '',
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
  } as KeyboardEvent;
}

async function loadShortcuts() {
  vi.resetModules();
  return import('../shortcuts');
}

describe('shortcuts', () => {
  describe('formatShortcut (Mac)', () => {
    let formatShortcut: Awaited<ReturnType<typeof loadShortcuts>>['formatShortcut'];

    beforeAll(async () => {
      navigatorSpy.mockReturnValue({ userAgent: 'Macintosh' } as Navigator);
      ({ formatShortcut } = await loadShortcuts());
    });

    it('formats mod key as ⌘ on Mac', () => {
      expect(formatShortcut('mod+n')).toBe('⌘N');
    });
  });

  describe('formatShortcut (PC)', () => {
    let formatShortcut: Awaited<ReturnType<typeof loadShortcuts>>['formatShortcut'];

    beforeAll(async () => {
      navigatorSpy.mockReturnValue({ userAgent: 'Windows NT' } as Navigator);
      ({ formatShortcut } = await loadShortcuts());
    });

    it('formats mod key as Ctrl on PC', () => {
      expect(formatShortcut('mod+n')).toBe('Ctrl+N');
    });

    it('formats special keys', () => {
      expect(formatShortcut('mod+backspace')).toBe('Ctrl+Backspace');
      expect(formatShortcut('escape')).toBe('Esc');
      expect(formatShortcut('mod+comma')).toBe('Ctrl+,');
    });
  });

  describe('getDefaultShortcutMap', () => {
    it('returns all shortcut actions with default keys', async () => {
      const { getDefaultShortcutMap, SHORTCUT_ACTIONS } = await loadShortcuts();
      const map = getDefaultShortcutMap();
      for (const action of SHORTCUT_ACTIONS) {
        expect(map[action.id]).toBe(action.defaultKey);
      }
    });
  });

  describe('matchShortcut (PC)', () => {
    let matchShortcut: Awaited<ReturnType<typeof loadShortcuts>>['matchShortcut'];

    beforeAll(async () => {
      navigatorSpy.mockReturnValue({ userAgent: 'Windows NT' } as Navigator);
      ({ matchShortcut } = await loadShortcuts());
    });

    it('matches mod+n on PC (ctrlKey)', () => {
      expect(matchShortcut(mockKeyEvent({ key: 'n', ctrlKey: true }), 'mod+n')).toBe(true);
    });

    it('rejects when mod not pressed', () => {
      expect(matchShortcut(mockKeyEvent({ key: 'n' }), 'mod+n')).toBe(false);
    });

    it('matches escape', () => {
      expect(matchShortcut(mockKeyEvent({ key: 'Escape' }), 'escape')).toBe(true);
    });

    it('rejects extra modifier keys', () => {
      expect(matchShortcut(mockKeyEvent({ key: 'n', ctrlKey: true, shiftKey: true }), 'mod+n')).toBe(false);
    });
  });

  describe('shortcutToRecordKey (PC)', () => {
    let shortcutToRecordKey: Awaited<ReturnType<typeof loadShortcuts>>['shortcutToRecordKey'];

    beforeAll(async () => {
      navigatorSpy.mockReturnValue({ userAgent: 'Windows NT' } as Navigator);
      ({ shortcutToRecordKey } = await loadShortcuts());
    });

    it('returns null for modifier-only key', () => {
      expect(shortcutToRecordKey(mockKeyEvent({ key: 'Control' }))).toBeNull();
      expect(shortcutToRecordKey(mockKeyEvent({ key: 'Shift' }))).toBeNull();
      expect(shortcutToRecordKey(mockKeyEvent({ key: 'Alt' }))).toBeNull();
      expect(shortcutToRecordKey(mockKeyEvent({ key: 'Meta' }))).toBeNull();
    });

    it('records mod+key combination', () => {
      expect(shortcutToRecordKey(mockKeyEvent({ key: 'n', ctrlKey: true }))).toBe('mod+n');
    });

    it('maps space key', () => {
      expect(shortcutToRecordKey(mockKeyEvent({ key: ' ' }))).toBe('space');
    });

    it('maps comma key', () => {
      expect(shortcutToRecordKey(mockKeyEvent({ key: ',' }))).toBe('comma');
    });

    it('maps period key', () => {
      expect(shortcutToRecordKey(mockKeyEvent({ key: '.' }))).toBe('period');
    });
  });

  describe('shortcutToRecordKey (Mac)', () => {
    let shortcutToRecordKey: Awaited<ReturnType<typeof loadShortcuts>>['shortcutToRecordKey'];

    beforeAll(async () => {
      navigatorSpy.mockReturnValue({ userAgent: 'Macintosh' } as Navigator);
      ({ shortcutToRecordKey } = await loadShortcuts());
    });

    it('records ctrl as separate modifier on Mac', () => {
      expect(shortcutToRecordKey(mockKeyEvent({ key: 'n', ctrlKey: true }))).toBe('ctrl+n');
    });

    it('records mod (meta) on Mac', () => {
      expect(shortcutToRecordKey(mockKeyEvent({ key: 'n', metaKey: true }))).toBe('mod+n');
    });
  });
});
