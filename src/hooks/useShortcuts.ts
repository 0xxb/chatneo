import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { useChatStore } from '../store/chat';
import { useSidebarStore } from '../store/sidebar';
import { getDb } from '../lib/db';
import { SHORTCUT_ACTIONS, getDefaultShortcutMap, matchShortcut } from '../lib/shortcuts';
import type { ShortcutMap } from '../lib/shortcuts';
import i18n from '../locales';
import { useTauriEvent } from './useTauriEvent';

function mergeShortcuts(custom: ShortcutMap): ShortcutMap {
  return { ...getDefaultShortcutMap(), ...custom };
}

export function useShortcuts() {
  const shortcutsRef = useRef<ShortcutMap>(getDefaultShortcutMap());

  useEffect(() => {
    getDb().then(async (db) => {
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = 'shortcuts'",
      );
      if (rows.length > 0 && rows[0].value) {
        try {
          shortcutsRef.current = mergeShortcuts(JSON.parse(rows[0].value));
        } catch { /* use defaults */ }
      }
    });
  }, []);

  useTauriEvent<{ key: string; value: string }>('settings-changed', ({ payload }) => {
    if (payload.key === 'shortcuts') {
      try {
        shortcutsRef.current = mergeShortcuts(JSON.parse(payload.value));
      } catch { /* use defaults */ }
    }
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (window.location.hash) return;

      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      const shortcuts = shortcutsRef.current;

      for (const action of SHORTCUT_ACTIONS) {
        const key = shortcuts[action.id];
        if (!key || !matchShortcut(e, key)) continue;
        if (action.id !== 'stopGeneration' && isInput) continue;

        e.preventDefault();
        e.stopPropagation();
        executeAction(action.id);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}

function switchChat(direction: 1 | -1) {
  const { conversations, activeConversationId } = useChatStore.getState();
  if (conversations.length === 0) return;
  const idx = conversations.findIndex((c) => c.id === activeConversationId);
  const next = (idx + direction + conversations.length) % conversations.length;
  useChatStore.getState().setActiveConversation(conversations[next].id);
}

function executeAction(actionId: string) {
  const store = useChatStore.getState();
  const t = i18n.t.bind(i18n);

  switch (actionId) {
    case 'newChat':
      store.newChat();
      break;

    case 'deleteChat': {
      const id = store.activeConversationId;
      if (!id) break;
      ask(t('conversation.deleteConfirm'), {
        title: t('conversation.deleteTitle'),
        kind: 'warning',
      }).then((confirmed) => {
        if (confirmed) store.deleteConversation(id);
      });
      break;
    }

    case 'searchChat': {
      const el = document.querySelector<HTMLInputElement>('[data-shortcut-search]');
      if (el) { el.focus(); el.select(); }
      break;
    }

    case 'prevChat':
      switchChat(-1);
      break;

    case 'nextChat':
      switchChat(1);
      break;

    case 'focusInput':
      document.querySelector<HTMLTextAreaElement>('[data-shortcut-input]')?.focus();
      break;

    case 'regenerate':
      window.dispatchEvent(new CustomEvent('shortcut-regenerate'));
      break;

    case 'stopGeneration': {
      const convId = store.activeConversationId;
      if (convId) store.stopAnyStreaming(convId);
      break;
    }

    case 'toggleSidebar':
      useSidebarStore.getState().toggle();
      break;

    case 'openSettings':
      invoke('open_settings').catch(console.error);
      break;
  }
}
