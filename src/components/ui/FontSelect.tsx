import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';

interface FontSelectProps {
  value: string;
  onChange: (value: string) => void;
}

let fontPromise: Promise<string[]> | null = null;

function loadFonts(): Promise<string[]> {
  if (!fontPromise) {
    fontPromise = invoke<string[]>('get_system_fonts');
  }
  return fontPromise;
}

export default function FontSelect({ value, onChange }: FontSelectProps) {
  const { t } = useTranslation();
  const [fonts, setFonts] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFonts().then(setFonts);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = search
    ? fonts.filter((f) => f.toLowerCase().includes(search.toLowerCase()))
    : fonts;

  const displayValue = value || t('settings.appearance.systemDefault');

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-48 px-2.5 py-1 text-[13px] text-left rounded-md border border-(--color-separator) bg-(--color-bg-control) text-(--color-label) hover:border-(--color-label-tertiary) transition-colors truncate"
      >
        {displayValue}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-(--color-bg-popover) backdrop-blur-xl rounded-lg shadow-popover border border-(--color-separator) z-50 overflow-hidden">
          <div className="p-1.5">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('settings.appearance.searchFont')}
              className="w-full px-2 py-1 text-[13px] rounded-md bg-(--color-fill) text-(--color-label) placeholder:text-(--color-label-tertiary) outline-none"
            />
          </div>
          <div className="max-h-48 overflow-auto px-1 pb-1">
            <button
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-2 py-1 text-[13px] rounded-md transition-colors ${
                !value ? 'bg-(--color-accent) text-white' : 'text-(--color-label) hover:bg-(--color-fill-secondary)'
              }`}
            >
              {t('settings.appearance.systemDefault')}
            </button>
            {filtered.map((font) => (
              <button
                key={font}
                onClick={() => { onChange(font); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-2 py-1 text-[13px] rounded-md transition-colors truncate ${
                  value === font ? 'bg-(--color-accent) text-white' : 'text-(--color-label) hover:bg-(--color-fill-secondary)'
                }`}
                style={{ fontFamily: font }}
              >
                {font}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-[12px] text-(--color-label-tertiary) text-center">
                {t('common.noMatch')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
