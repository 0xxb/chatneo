import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Globe } from 'lucide-react';
import type { SearchResult } from '../../lib/knowledge-base';

interface Props {
  results: SearchResult[];
}

export default function CitationPanel({ results }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedChunkId, setExpandedChunkId] = useState<number | null>(null);

  if (results.length === 0) return null;

  return (
    <div className="mt-2 border border-(--color-separator) rounded-lg text-xs overflow-hidden">
      <button
        className="w-full flex items-center gap-1.5 px-3 py-2 text-(--color-label-secondary) hover:bg-(--color-fill-secondary) transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
        <span>引用来源 ({results.length})</span>
      </button>
      {expanded && (
        <div className="border-t border-(--color-separator)">
          {results.map((r) => (
            <div key={r.chunk_id}>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-(--color-fill-secondary) transition-colors text-left"
                onClick={() => setExpandedChunkId(expandedChunkId === r.chunk_id ? null : r.chunk_id)}
              >
                {r.document_type === 'url'
                  ? <Globe className="w-3.5 h-3.5 shrink-0 text-(--color-label-secondary)" />
                  : <FileText className="w-3.5 h-3.5 shrink-0 text-(--color-label-secondary)" />
                }
                <span className="flex-1 truncate text-(--color-label-secondary)">{r.document_name}</span>
                <span className="shrink-0 tabular-nums text-(--color-label-secondary)">
                  {Math.max(0, (1 - r.distance) * 100).toFixed(1)}%
                </span>
              </button>
              {expandedChunkId === r.chunk_id && (
                <div className="px-3 py-2 border-t border-(--color-separator) text-(--color-label-secondary) whitespace-pre-wrap leading-relaxed">
                  {r.content}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
