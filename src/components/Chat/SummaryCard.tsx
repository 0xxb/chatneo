import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

interface SummaryCardProps {
  compressedCount: number;
  content: string;
}

export default function SummaryCard({ compressedCount, content }: SummaryCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mx-auto max-w-2xl w-full">
      <button
        className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg bg-(--color-fill) hover:bg-(--color-fill-secondary) transition-colors text-xs text-(--color-label-secondary)"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span>{t('chat.summaryCard', { count: compressedCount })}</span>
      </button>
      {expanded && (
        <div className="mt-1 px-3 py-2 rounded-lg bg-(--color-fill) text-xs text-(--color-label-secondary) leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}
