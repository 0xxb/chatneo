import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Ellipsis, Settings, MessageSquare } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

export default function UserInfo() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg text-(--color-label-tertiary) hover:text-(--color-label-secondary) hover:bg-(--color-fill-secondary) transition-colors"
      >
        <Ellipsis className="w-[18px] h-[18px]" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 min-w-36 rounded-lg bg-(--color-bg-popover) backdrop-blur-xl shadow-(--shadow-popover) ring-1 ring-(--color-separator) py-1 z-[100] animate-in fade-in-0 zoom-in-95 origin-bottom-left">
          <button
            onClick={() => {
              setOpen(false);
              openUrl('https://github.com/0xxb/chatneo/issues');
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-(--color-label) hover:bg-(--color-fill) transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {t('user.feedback')}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              invoke('open_settings').catch(console.error);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-(--color-label) hover:bg-(--color-fill) transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            {t('settings.title')}
          </button>
        </div>
      )}
    </div>
  );
}
