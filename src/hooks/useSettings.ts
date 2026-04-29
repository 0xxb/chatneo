import { useState, useEffect, useCallback, useRef } from 'react';
import { emit } from '@tauri-apps/api/event';
import { getAllSettings, setSetting as daoSetSetting } from '../lib/dao/settings-dao';
import { useTauriEvent } from './useTauriEvent';

interface SettingsMap {
  [key: string]: string;
}

export function useSettings() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const debounceTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // 保存尚未落库的最新值，用于 unmount 时 flush
  const pendingWrites = useRef(new Map<string, string>());

  const persist = useCallback(async (key: string, value: string) => {
    await daoSetSetting(key, value);
    emit('settings-changed', { key, value });
  }, []);

  useEffect(() => {
    let mounted = true;
    getAllSettings().then((map) => {
      if (!mounted) return;
      setSettings(map);
      setLoading(false);
    });

    // 引用同一 Map 实例，避免 cleanup 闭包捕获后被 React Strict Mode 重新挂载覆盖
    const timers = debounceTimers.current;
    const pending = pendingWrites.current;
    return () => {
      mounted = false;
      // Flush 所有尚未执行的防抖写入，避免滑动后立即关窗时最后一次改动丢失
      for (const [key, timer] of timers) {
        clearTimeout(timer);
        const value = pending.get(key);
        if (value !== undefined) {
          // 不 await：cleanup 不允许异步；失败时仅记录
          persist(key, value).catch(() => {});
        }
      }
      timers.clear();
      pending.clear();
    };
  }, [persist]);

  // Subscribe to settings changes from other sources (e.g. WebDAV scheduler)
  useTauriEvent<{ key: string; value: string }>('settings-changed', ({ payload }) => {
    setSettings((prev) => ({ ...prev, [payload.key]: payload.value }));
  });

  const setSetting = useCallback(async (key: string, value: string, debounce?: number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (debounce) {
      const timers = debounceTimers.current;
      clearTimeout(timers.get(key));
      pendingWrites.current.set(key, value);
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        pendingWrites.current.delete(key);
        persist(key, value);
      }, debounce));
    } else {
      pendingWrites.current.delete(key);
      await persist(key, value);
    }
  }, [persist]);

  return { settings, loading, setSetting };
}
