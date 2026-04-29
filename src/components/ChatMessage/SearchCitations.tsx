import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SearchResultItem } from './types';
import { extractDomain, safeOpenUrl } from './search-utils';
import Favicon from './Favicon';

function calcPos(anchor: HTMLButtonElement, panelHeight: number) {
  const rect = anchor.getBoundingClientRect();
  if (rect.top >= panelHeight) {
    return { left: rect.left, top: rect.top - panelHeight - 6 };
  }
  return { left: rect.left, top: rect.bottom + 6 };
}

function SourcePopover({ results, anchorRef, onClose }: { results: SearchResultItem[]; anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const updatePos = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = ref.current;
    if (!anchor || !panel) return;
    setPos(calcPos(anchor, panel.offsetHeight));
  }, [anchorRef]);

  useEffect(() => {
    updatePos();
    document.addEventListener('scroll', updatePos, { passive: true, capture: true });
    window.addEventListener('resize', updatePos, { passive: true });
    return () => {
      document.removeEventListener('scroll', updatePos, { capture: true });
      window.removeEventListener('resize', updatePos);
    };
  }, [updatePos]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className="chat-popover w-96 max-h-80 rounded-xl border border-(--color-separator) bg-(--color-bg-popover) backdrop-blur-xl shadow-lg z-[9999] flex flex-col"
    >
      <div className="px-3 py-2 text-xs font-medium text-(--color-label-secondary) border-b border-(--color-separator) shrink-0">
        {t('chat.sources')}
      </div>
      <div className="overflow-y-auto">
        {results.map((r, i) => {
          const domain = extractDomain(r.url);
          return (
            <button
              key={i}
              onClick={() => safeOpenUrl(r.url)}
              className="flex items-start gap-2 px-3 py-2.5 hover:bg-(--color-fill) transition-colors w-full text-left border-b border-(--color-separator) last:border-b-0"
            >
              <Favicon domain={domain} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-(--color-label) font-medium truncate">{r.title}</span>
                  <span className="text-[11px] text-(--color-label-quaternary) shrink-0">{domain}</span>
                </div>
                {r.snippet && (
                  <div className="text-[11px] text-(--color-label-tertiary) line-clamp-2 mt-0.5">{r.snippet}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

export default function SearchCitations({ results }: { results: SearchResultItem[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const domains = useMemo(() =>
    [...new Set(results.map((r) => extractDomain(r.url)))].filter(Boolean).slice(0, 5),
    [results],
  );

  return (
    <div className={`relative transition-opacity ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
      <button
        ref={anchorRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-(--color-label-tertiary) hover:text-(--color-label-secondary) transition-colors"
      >
        <span className="flex items-center">
          {domains.map((domain, i) => (
            <span key={domain} className="shrink-0" style={{ marginLeft: i > 0 ? -4 : 0, zIndex: 10 - i }}>
              <Favicon domain={domain} />
            </span>
          ))}
        </span>
        <span>{results.length} {t('chat.sources')}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <SourcePopover results={results} anchorRef={anchorRef} onClose={() => setOpen(false)} />}
    </div>
  );
}
