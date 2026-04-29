import { describe, it, expect, vi, beforeAll } from 'vitest';

const navigatorSpy = vi.spyOn(globalThis, 'navigator', 'get');

function mockKeyEvent(init: {
  key: string; code?: string;
  ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean;
}) {
  return {
    key: init.key, code: init.code ?? '',
    ctrlKey: init.ctrlKey ?? false, metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false, altKey: init.altKey ?? false,
  } as KeyboardEvent;
}

describe('matchShortcut (Mac) — ctrl modifier branch', () => {
  let matchShortcut: (e: KeyboardEvent, shortcut: string) => boolean;

  beforeAll(async () => {
    navigatorSpy.mockReturnValue({ userAgent: 'Macintosh' } as Navigator);
    vi.resetModules();
    ({ matchShortcut } = await import('../shortcuts'));
  });

  it('matches ctrl+key shortcut on Mac', () => {
    expect(matchShortcut(mockKeyEvent({ key: 'a', ctrlKey: true }), 'ctrl+a')).toBe(true);
  });

  it('rejects ctrl shortcut when ctrlKey not pressed on Mac', () => {
    expect(matchShortcut(mockKeyEvent({ key: 'a' }), 'ctrl+a')).toBe(false);
  });

  it('rejects when ctrlKey pressed but shortcut does not require ctrl on Mac', () => {
    expect(matchShortcut(mockKeyEvent({ key: 'a', ctrlKey: true, metaKey: true }), 'mod+a')).toBe(false);
  });

  it('matches mod+key on Mac using metaKey', () => {
    expect(matchShortcut(mockKeyEvent({ key: 'n', metaKey: true }), 'mod+n')).toBe(true);
  });

  it('matches by code when key does not match', () => {
    expect(matchShortcut(mockKeyEvent({ key: 'å', code: 'KeyA', metaKey: true }), 'mod+a')).toBe(true);
  });
});
