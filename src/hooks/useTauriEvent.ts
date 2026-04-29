import { useEffect, useRef } from 'react';
import { listen, type Event, type EventName } from '@tauri-apps/api/event';

/**
 * 订阅 Tauri 事件，自动处理 listen() 的异步竞态：
 * 当组件在 listen 的 Promise resolve 之前卸载时，会立即反向 unlisten，
 * 避免回调泄漏和 HMR 重载叠加监听器。
 *
 * handler 通过 ref 透传，调用方无需用 useCallback 稳定引用。
 */
export function useTauriEvent<T = unknown>(
  eventName: EventName,
  handler: (event: Event<T>) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    listen<T>(eventName, (event) => handlerRef.current(event))
      .then((fn) => {
        if (cancelled) fn();
        else cleanup = fn;
      })
      .catch(() => { /* ignore */ });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [eventName]);
}
