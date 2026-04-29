import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Search } from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';
import { SettingGroup, SettingRow } from '../../components/Settings/SettingGroup';
import { NativeSelect } from '../../components/ui/native';
import { useSettings } from '../../hooks/useSettings';
import {
  SHORTCUT_ACTIONS,
  getDefaultShortcutMap,
  formatShortcut,
  shortcutToRecordKey,
} from '../../lib/shortcuts';
import type { ShortcutMap } from '../../lib/shortcuts';

export default function ShortcutSettings() {
  const { t } = useTranslation();
  const { settings, loading, setSetting } = useSettings();
  const [search, setSearch] = useState('');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const recordingRef = useRef<string | null>(null);
  const shortcutsRef = useRef<ShortcutMap>(getDefaultShortcutMap());
  const updateShortcutRef = useRef<(actionId: string, newKey: string) => void>(undefined);

  const shortcuts = useMemo<ShortcutMap>(() => {
    const defaults = getDefaultShortcutMap();
    if (!settings.shortcuts) return defaults;
    try {
      return { ...defaults, ...JSON.parse(settings.shortcuts) };
    } catch {
      return defaults;
    }
  }, [settings.shortcuts]);

  useEffect(() => { recordingRef.current = recordingId; }, [recordingId]);
  useEffect(() => { shortcutsRef.current = shortcuts; }, [shortcuts]);

  const saveShortcuts = useCallback(
    (map: ShortcutMap) => {
      const defaults = getDefaultShortcutMap();
      const custom: ShortcutMap = {};
      for (const [id, key] of Object.entries(map)) {
        if (key !== defaults[id]) custom[id] = key;
      }
      setSetting('shortcuts', JSON.stringify(custom));
    },
    [setSetting],
  );

  const updateShortcut = useCallback(
    (actionId: string, newKey: string) => {
      const updated = { ...shortcutsRef.current, [actionId]: newKey };
      saveShortcuts(updated);
    },
    [saveShortcuts],
  );

  useEffect(() => { updateShortcutRef.current = updateShortcut; }, [updateShortcut]);

  const resetOne = useCallback(
    (actionId: string) => {
      const defaults = getDefaultShortcutMap();
      updateShortcut(actionId, defaults[actionId]);
    },
    [updateShortcut],
  );

  const resetAll = useCallback(async () => {
    const confirmed = await ask(t('shortcuts.resetAllConfirm'), {
      title: t('shortcuts.resetAllTitle'),
      kind: 'warning',
    });
    if (confirmed) {
      setSetting('shortcuts', '{}');
    }
  }, [t, setSetting]);

  // Stable keydown handler — uses refs to avoid re-registration
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!recordingRef.current) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecordingId(null);
        setConflict(null);
        return;
      }

      const recorded = shortcutToRecordKey(e);
      if (!recorded) return;

      const current = shortcutsRef.current;
      const conflictAction = SHORTCUT_ACTIONS.find(
        (a) => a.id !== recordingRef.current && current[a.id] === recorded,
      );

      if (conflictAction) {
        setConflict(t('shortcuts.conflict', { action: t(conflictAction.labelKey) }));
        return;
      }

      updateShortcutRef.current?.(recordingRef.current!, recorded);
      setRecordingId(null);
      setConflict(null);
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [t]);

  const groups = useMemo(() => {
    const groupOrder: Array<'conversation' | 'message' | 'navigation'> = [
      'conversation',
      'message',
      'navigation',
    ];

    return groupOrder.map((group) => ({
      group,
      label: t(`shortcuts.groups.${group}`),
      actions: SHORTCUT_ACTIONS.filter((a) => {
        if (a.group !== group) return false;
        if (!search) return true;
        const searchLower = search.toLowerCase();
        const label = t(a.labelKey).toLowerCase();
        const shortcutDisplay = formatShortcut(shortcuts[a.id]).toLowerCase();
        return label.includes(searchLower) || shortcutDisplay.includes(searchLower);
      }),
    })).filter((g) => g.actions.length > 0);
  }, [search, shortcuts, t]);

  if (loading) return null;

  return (
    <div className="max-w-2xl mx-auto p-5 space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--color-label-tertiary)" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('shortcuts.search')}
          className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-(--color-fill-secondary) border border-(--color-separator) rounded-md text-(--color-label) placeholder:text-(--color-label-tertiary) outline-none focus:border-(--color-accent)"
        />
      </div>

      <SettingGroup title={t('settings.editor.sendKey')}>
        <SettingRow label={t('settings.editor.sendKey')} desc={t('settings.editor.sendKeyDesc')}>
          <NativeSelect
            value={settings.send_key ?? 'Enter'}
            onChange={(e) => setSetting('send_key', e.target.value)}
          >
            <option value="Enter">Enter</option>
            <option value="Cmd+Enter">Cmd+Enter</option>
          </NativeSelect>
        </SettingRow>
      </SettingGroup>

      {groups.map(({ group, label, actions }) => (
        <SettingGroup key={group} title={label}>
          {actions.map((action) => (
            <SettingRow key={action.id} label={t(action.labelKey)} desc={t(action.descKey)}>
              <div className="flex items-center gap-1.5">
                {recordingId === action.id ? (
                  <button
                    className="px-2 py-0.5 text-[12px] font-mono rounded border border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent) animate-pulse"
                  >
                    {t('shortcuts.recording')}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setRecordingId(action.id);
                      setConflict(null);
                    }}
                    className="px-2 py-0.5 text-[12px] font-mono rounded border border-(--color-separator) bg-(--color-fill-secondary) text-(--color-label) hover:border-(--color-accent) transition-colors"
                  >
                    {formatShortcut(shortcuts[action.id])}
                  </button>
                )}
                <button
                  onClick={() => resetOne(action.id)}
                  className="p-0.5 text-(--color-label-tertiary) hover:text-(--color-label) transition-colors"
                  title={t('common.reset')}
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </SettingRow>
          ))}
        </SettingGroup>
      ))}

      {conflict && (
        <div className="text-[12px] text-red-500 px-1">
          {conflict}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={resetAll}
          className="text-[12px] text-(--color-label-secondary) hover:text-(--color-label) transition-colors"
        >
          {t('shortcuts.resetAll')}
        </button>
      </div>
    </div>
  );
}
