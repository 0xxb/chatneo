import { useState, useRef, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Streamdown } from 'streamdown';
import { normalizeLatexDelimiters } from '../../utils/latex';
import { streamdownPlugins as plugins } from '../../lib/streamdown-plugins';

interface ThinkingBlockProps {
  thinking: string;
  isStreaming?: boolean;
  isThinkingActive?: boolean;
}

export default function ThinkingBlock({ thinking, isStreaming, isThinkingActive }: ThinkingBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(isStreaming ?? false);
  const wasStreamingRef = useRef(isStreaming);
  const userToggledRef = useRef(false);

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setExpanded(false);
      userToggledRef.current = false;
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Auto-expand only once when streaming thinking first arrives, unless user manually toggled
  const hadThinkingRef = useRef(false);
  useEffect(() => {
    if (isStreaming && thinking && !hadThinkingRef.current && !userToggledRef.current) {
      hadThinkingRef.current = true;
      setExpanded(true);
    }
  }, [isStreaming, thinking]);

  const handleToggle = () => {
    userToggledRef.current = true;
    setExpanded(!expanded);
  };

  return (
    <div className="mb-3">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1 text-xs text-(--color-label-secondary) hover:text-(--color-label) transition-colors"
      >
        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
        <span>{t('chat.thinkingProcess')}</span>
        {isThinkingActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-(--color-accent) animate-pulse ml-1" />
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 ml-1 pl-3 border-l-2 border-(--color-separator) text-xs text-(--color-label-secondary) leading-relaxed break-words **:select-text">
          <Streamdown plugins={plugins} isAnimating={isThinkingActive}>
            {normalizeLatexDelimiters(thinking)}
          </Streamdown>
        </div>
      )}
    </div>
  );
}
