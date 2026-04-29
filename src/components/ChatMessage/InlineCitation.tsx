import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { SearchResultItem } from './types';
import { extractDomain, safeOpenUrl } from './search-utils';
import Favicon from './Favicon';

function truncateTitle(title: string, max: number): string {
  return title.length > max ? title.slice(0, max) + '…' : title;
}

function CitationPopover({ result, anchorRect, onEnter, onLeave }: {
  result: SearchResultItem;
  anchorRect: DOMRect;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const domain = extractDomain(result.url);
  const spaceAbove = anchorRect.top;
  const popoverHeight = 80;
  const showAbove = spaceAbove >= popoverHeight;

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(anchorRect.left + anchorRect.width / 2 - 144, window.innerWidth - 296)),
    ...(showAbove
      ? { bottom: window.innerHeight - anchorRect.top + 4 }
      : { top: anchorRect.bottom + 4 }),
    zIndex: 9999,
  };

  return createPortal(
    <div
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="w-72 rounded-lg border border-(--color-separator) bg-(--color-bg-popover) backdrop-blur-xl shadow-lg p-2.5"
    >
      <button
        onClick={() => safeOpenUrl(result.url)}
        className="flex items-start gap-2 w-full text-left cursor-pointer"
      >
        <Favicon domain={domain} size={16} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-(--color-label) font-medium line-clamp-2">{result.title}</div>
          {result.snippet && (
            <div className="text-[11px] text-(--color-label-tertiary) line-clamp-3 mt-1">{result.snippet}</div>
          )}
        </div>
      </button>
    </div>,
    document.body,
  );
}

export function CitationBadge({ result }: { result: SearchResultItem }) {
  const [showPopover, setShowPopover] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const btnRef = useRef<HTMLButtonElement>(null);
  const domain = extractDomain(result.url);
  const shortTitle = truncateTitle(result.title, 20);

  const handleEnter = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect());
      setShowPopover(true);
    }, 200);
  }, []);

  const handleLeave = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowPopover(false), 150);
  }, []);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <span className="inline-flex align-baseline mx-0.5">
      <button
        ref={btnRef}
        onClick={() => safeOpenUrl(result.url)}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-(--color-fill-secondary) hover:bg-(--color-fill-tertiary) text-[11px] text-(--color-label-secondary) no-underline transition-colors cursor-pointer leading-tight"
      >
        <Favicon domain={domain} size={12} />
        <span className="max-w-32 truncate">{shortTitle}</span>
      </button>
      {showPopover && anchorRect && (
        <CitationPopover
          result={result}
          anchorRect={anchorRect}
          onEnter={handleEnter}
          onLeave={handleLeave}
        />
      )}
    </span>
  );
}

export function matchCitation(
  marker: string,
  results: SearchResultItem[],
): { result: SearchResultItem; label: string } | null {
  const trimmed = marker.trim();

  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= results.length) {
    const r = results[num - 1];
    return { result: r, label: r.title };
  }

  const lower = trimmed.toLowerCase();
  for (const r of results) {
    const domain = extractDomain(r.url).toLowerCase().replace(/^www\./, '');
    if (
      r.title.toLowerCase().includes(lower) ||
      domain.includes(lower) ||
      lower.includes(domain.split('.')[0])
    ) {
      return { result: r, label: r.title };
    }
  }

  return null;
}

function escapeMarkdownLink(text: string): string {
  return text.replace(/[\[\]()]/g, '\\$&');
}

export function processCitationMarkers(
  text: string,
  results: SearchResultItem[],
): { processedText: string; citations: Map<string, { result: SearchResultItem; label: string }> } {
  const citations = new Map<string, { result: SearchResultItem; label: string }>();
  let counter = 0;

  // Only match numeric references like [1], [2], [1,3], [1-3] — not arbitrary bracket text
  const processedText = text.replace(/\[(\d[\d,\s\-]*)\](?!\()/g, (match, inner) => {
    const matched = matchCitation(inner, results);
    if (!matched) return match;
    const id = `__cite_${counter++}`;
    citations.set(id, matched);
    const short = truncateTitle(matched.result.title, 15);
    return `[${escapeMarkdownLink(short)}](#${id})`;
  });

  return { processedText, citations };
}
