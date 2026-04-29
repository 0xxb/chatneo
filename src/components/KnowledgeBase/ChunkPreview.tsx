import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getDocumentChunks } from '../../lib/knowledge-base';
import type { KnowledgeChunk } from '../../lib/knowledge-base';

export default function ChunkPreview({ documentId }: { documentId: string }) {
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    getDocumentChunks(documentId).then(setChunks);
  }, [documentId]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (chunks.length === 0) return null;

  return (
    <div className="mt-1 ml-6 space-y-1">
      {chunks.map((chunk) => {
        const isOpen = expanded.has(chunk.id);
        const preview = chunk.content.slice(0, 100);
        const truncated = chunk.content.length > 100;
        return (
          <div
            key={chunk.id}
            className="rounded-md bg-(--color-fill-secondary) px-3 py-2 text-xs"
          >
            <button
              onClick={() => toggle(chunk.id)}
              className="flex w-full items-center gap-1.5 text-left"
            >
              {isOpen ? (
                <ChevronDown className="size-3 shrink-0 text-(--color-label-tertiary)" />
              ) : (
                <ChevronRight className="size-3 shrink-0 text-(--color-label-tertiary)" />
              )}
              <span className="font-medium text-(--color-label-secondary)">
                #{chunk.position + 1}
              </span>
              <span className="shrink-0 text-(--color-label-tertiary)">
                {chunk.content.length} 字符
              </span>
              {!isOpen && (
                <span className="ml-1 truncate text-(--color-label-secondary)">
                  {preview}
                  {truncated && '…'}
                </span>
              )}
            </button>
            {isOpen && (
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-(--color-label)">
                {chunk.content}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
