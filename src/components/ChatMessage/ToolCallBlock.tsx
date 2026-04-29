import { useState, useRef, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTool } from '../../lib/tool-registry';
import type { ToolCallData } from '../../lib/tool-call-types';
import Spinner from '../ui/Spinner';

interface ToolCallBlockProps {
  toolCalls: ToolCallData[];
  isStreaming?: boolean;
}

function GenericStatusBar({ tc }: { tc: ToolCallData }) {
  const { t } = useTranslation();
  const def = getTool(tc.toolName);
  const isCalling = tc.state === 'calling';
  const isError = tc.state === 'error';

  return (
    <div className="flex items-center gap-2">
      {def?.icon && <span className="text-xs">{def.icon}</span>}
      {isCalling ? (
        <>
          <Spinner className="w-3 h-3 text-(--color-accent)" />
          <span className="text-xs text-(--color-label-secondary)">{t('toolCall.calling', { name: def?.name ?? tc.toolName })}</span>
        </>
      ) : isError ? (
        <span className="text-xs text-red-500">{t('toolCall.error')}</span>
      ) : (
        <span className="text-[11px] text-(--color-label-tertiary)">{t('toolCall.completed')}</span>
      )}
    </div>
  );
}

function ToolCallItem({ tc, defaultExpanded }: { tc: ToolCallData; defaultExpanded: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isCalling = tc.state === 'calling';
  const isError = tc.state === 'error';

  let resultPreview = '';
  if (tc.state === 'result' && tc.result !== undefined) {
    try {
      resultPreview = typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2);
    } catch { resultPreview = String(tc.result); }
  } else if (isError) {
    resultPreview = tc.error ?? t('toolCall.failed');
  }

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-(--color-label-secondary) hover:text-(--color-label) transition-colors"
      >
        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${expanded ? 'rotate-90' : ''}`} />
        <GenericStatusBar tc={tc} />
      </button>
      {expanded && !isCalling && (
        <div className="mt-1 ml-1 pl-3 border-l-2 border-(--color-separator) text-xs text-(--color-label-secondary) leading-relaxed space-y-1">
          {Object.keys(tc.args).length > 0 && (
            <div>
              <span className="text-(--color-label-tertiary)">{t('toolCall.args')}</span>
              <pre className="mt-0.5 whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(tc.args, null, 2)}</pre>
            </div>
          )}
          {resultPreview && (
            <div>
              <span className={isError ? 'text-red-500' : 'text-(--color-label-tertiary)'}>
                {isError ? t('toolCall.errorDetail') : t('toolCall.result')}
              </span>
              <pre className={`mt-0.5 whitespace-pre-wrap break-all text-[11px] max-h-60 overflow-y-auto ${isError ? 'text-red-500' : ''}`}>{resultPreview}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ToolCallBlock({ toolCalls, isStreaming }: ToolCallBlockProps) {
  const filteredCalls = toolCalls.filter((tc) => tc.toolName !== 'web-search');
  const wasStreamingRef = useRef(isStreaming);
  const [autoExpand, setAutoExpand] = useState(isStreaming ?? false);

  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setAutoExpand(false);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  if (filteredCalls.length === 0) return null;

  return (
    <div className="mb-3">
      {filteredCalls.map((tc) => (
        <ToolCallItem key={tc.id} tc={tc} defaultExpanded={autoExpand || tc.state === 'calling'} />
      ))}
    </div>
  );
}
