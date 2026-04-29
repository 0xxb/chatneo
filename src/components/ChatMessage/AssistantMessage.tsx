import { useRef, useEffect, useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import { RotateCcw, Bot, Ellipsis, Pen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Streamdown } from 'streamdown';
import { PhotoSlider } from 'react-photo-view';
import GeneratedImage from './GeneratedImage';
import MessageActions, { ActionButton, CopyButton, PlayButton } from './MessageActions';
import ThinkingBlock from './ThinkingBlock';
import ToolCallBlock from './ToolCallBlock';
import ProviderIcon from '../ProviderIcon';
import { getAttachmentUrl } from '../../lib/attachments';
import { getSettingValue, subscribeSettings } from '../../lib/apply-settings';
import { useChatStore } from '../../store/chat';
import { useMessageMenu } from './useMessageMenu';
import { normalizeLatexDelimiters } from '../../utils/latex';
import { streamdownPlugins as plugins } from '../../lib/streamdown-plugins';
import { safeOpenUrl } from '../../lib/search-utils';
import type { ChatMessageProps, TokenUsage } from './types';
import CitationPanel from './CitationPanel';
import SearchCitations from './SearchCitations';
import { CitationBadge, processCitationMarkers } from './InlineCitation';

function formatUsage(u: TokenUsage): string {
  const parts: string[] = [];
  if (u.inputTokens > 0) parts.push(`输入 ${u.inputTokens}`);
  if (u.outputTokens > 0) parts.push(`输出 ${u.outputTokens}`);
  if (u.duration && u.duration > 0) {
    const secs = u.duration / 1000;
    parts.push(`耗时 ${secs.toFixed(1)}s`);
    if (u.outputTokens > 0) parts.push(`${(u.outputTokens / secs).toFixed(0)} token/s`);
  }
  return parts.join(' · ');
}

export default function AssistantMessage({ message, providerIcon, voiceOutput, onRegenerate, onBranchConversation, onDeleteMessage }: ChatMessageProps) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const markdownEnabled = useSyncExternalStore(
    subscribeSettings,
    () => (getSettingValue('markdown_rendering') ?? '1') === '1',
  );
  const showMenu = useMessageMenu({ onBranchConversation, onDeleteMessage });
  const [preview, setPreview] = useState<{ images: { key: string; src: string }[]; index: number } | null>(null);
  const isEditingThis = useChatStore((s) => s.editingMessageId === message.id);
  const [editText, setEditText] = useState('');
  const [editTab, setEditTab] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    if (isEditingThis) {
      setEditText(message.content);
      setEditTab('edit');
      requestAnimationFrame(() => editRef.current?.focus());
    }
  }, [isEditingThis]); // eslint-disable-line react-hooks/exhaustive-deps -- only reset when editing starts, not on content changes

  const editTextRef = useRef(editText);
  editTextRef.current = editText;

  const { processedContent, citationMap } = useMemo(() => {
    const results = message.ownSearchResults;
    if (!results || results.length === 0) {
      return { processedContent: message.content, citationMap: null };
    }
    const { processedText, citations } = processCitationMarkers(message.content, results);
    return { processedContent: processedText, citationMap: citations.size > 0 ? citations : null };
  }, [message.content, message.ownSearchResults]);

  const streamdownComponents = useMemo(() => {
    return {
      // 所有正文链接都走 safeOpenUrl：只放行 http/https，拦截 file:、自定义 scheme 与本窗口跳转。
      // 注意不能只在 citationMap 存在时才覆盖 <a>，否则普通消息的 Markdown 链接会绕过安全边界。
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (href?.startsWith('#__cite_') && citationMap) {
          const match = citationMap.get(href.slice(1));
          if (match) return <CitationBadge result={match.result} />;
        }
        return (
          <a
            href={href}
            {...props}
            onClick={(e) => {
              e.preventDefault();
              if (href) safeOpenUrl(href);
            }}
          >
            {children}
          </a>
        );
      },
    };
  }, [citationMap]);

  const handleSaveEdit = useCallback(async () => {
    await useChatStore.getState().updateMessageContent(message.id, editTextRef.current);
    useChatStore.getState().cancelEditMessage();
  }, [message.id]);

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isStreamdownImage = target.getAttribute('data-streamdown') === 'image' ||
      (target.tagName === 'IMG' && target.closest('[data-streamdown="image-wrapper"]'));
    if (!isStreamdownImage) return;
    const img = target.tagName === 'IMG' ? target as HTMLImageElement : target.querySelector('img') as HTMLImageElement | null;
    if (!img) return;
    const container = contentRef.current;
    if (!container) return;
    const imgElements = Array.from(container.querySelectorAll('[data-streamdown="image"]')) as HTMLImageElement[];
    const images = imgElements.map((el, i) => ({ key: String(i), src: el.src }));
    const clickedIndex = imgElements.indexOf(img);
    setPreview({ images, index: clickedIndex >= 0 ? clickedIndex : 0 });
  }, []);

  // Image grouping via MutationObserver
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const groupImages = () => {
      const wrappers = el.querySelectorAll(
        '[data-streamdown="image-wrapper"]:not(.sdm-image-scroll [data-streamdown="image-wrapper"])'
      );
      const grouped = new Set<Element>();
      wrappers.forEach((wrapper) => {
        if (grouped.has(wrapper)) return;
        const group: Element[] = [wrapper];
        grouped.add(wrapper);
        let next = wrapper.nextElementSibling;
        while (next?.getAttribute('data-streamdown') === 'image-wrapper') {
          group.push(next);
          grouped.add(next);
          next = next.nextElementSibling;
        }
        if (group.length < 2) return;
        const container = document.createElement('div');
        container.className = 'sdm-image-scroll';
        wrapper.parentNode!.insertBefore(container, wrapper);
        group.forEach((img) => container.appendChild(img));
      });
    };

    groupImages();

    const observer = new MutationObserver(groupImages);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="group" data-role="assistant">
      <div className="flex gap-3 items-start">
        <div className="chat-avatar w-8 h-8 rounded-full bg-(--color-fill-secondary) flex items-center justify-center shrink-0">
          {providerIcon && providerIcon !== 'default'
            ? <ProviderIcon icon={providerIcon} size={18} className="text-(--color-label-secondary)" />
            : <Bot className="w-4.5 h-4.5 text-(--color-label-secondary)" />
          }
        </div>
        <div className="chat-content flex-1 min-w-0">
          {message.thinking && (
            <ThinkingBlock
              thinking={message.thinking}
              isStreaming={message.isStreaming}
              isThinkingActive={message.isThinkingActive}
            />
          )}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <ToolCallBlock
              toolCalls={message.toolCalls}
              isStreaming={message.isStreaming}
            />
          )}
          {isEditingThis ? (
            <div className="space-y-2">
              <div className="flex gap-1 text-sm">
                {(['edit', 'preview'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setEditTab(tab)}
                    className={`px-3 py-1 rounded-md transition-colors ${editTab === tab ? 'bg-(--color-fill-secondary) text-(--color-label) font-medium' : 'text-(--color-label-tertiary) hover:text-(--color-label-secondary)'}`}
                  >
                    {t(`common.${tab}`)}
                  </button>
                ))}
              </div>
              {editTab === 'edit' ? (
                <textarea
                  ref={editRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') useChatStore.getState().cancelEditMessage(); }}
                  className="w-full min-h-32 p-3 rounded-lg bg-(--color-bg-control) text-(--color-label) text-chat border border-(--color-separator) focus:border-(--color-accent) focus:outline-none resize-y"
                />
              ) : (
                <div className="min-h-32 p-3 rounded-lg border border-(--color-separator) text-chat text-(--color-label) **:select-text overflow-hidden break-words">
                  <Streamdown plugins={plugins} isAnimating={false}>
                    {normalizeLatexDelimiters(editText)}
                  </Streamdown>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => useChatStore.getState().cancelEditMessage()}
                  className="px-3 py-1 text-sm rounded-md text-(--color-label-secondary) hover:bg-(--color-fill-secondary) transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-sm rounded-md bg-(--color-accent) text-white hover:opacity-90 transition-opacity"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          ) : message.mediaParts && message.mediaParts.length > 0 ? (
            <div className="flex overflow-x-auto gap-2 py-1 pb-2">
              {message.mediaParts.map((part) =>
                part.type === 'image' ? (
                  <GeneratedImage key={part.path} path={part.path} revisedPrompt={part.revisedPrompt} />
                ) : part.type === 'video' ? (
                  <div key={part.path} className="shrink-0 rounded-lg overflow-hidden">
                    <video
                      src={`${getAttachmentUrl(part.path)}#t=0.1`}
                      controls
                      preload="metadata"
                      playsInline
                      className="max-w-full max-h-[70vh] rounded-lg"
                    />
                  </div>
                ) : null
              )}
            </div>
          ) : (
            <>
              <div ref={contentRef} onClick={handleContentClick} className={`${message.content ? 'min-h-8' : ''} flex items-center text-chat text-(--color-label) **:select-text overflow-hidden break-words`}>
                {markdownEnabled ? (
                  <Streamdown
                    plugins={plugins}
                    isAnimating={message.isStreaming}
                    components={streamdownComponents}
                  >
                    {normalizeLatexDelimiters(processedContent)}
                  </Streamdown>
                ) : (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                )}
              </div>
              {preview && (
                <PhotoSlider
                  images={preview.images}
                  visible
                  onClose={() => setPreview(null)}
                  index={preview.index}
                  onIndexChange={(i) => setPreview((prev) => prev ? { ...prev, index: i } : null)}
                />
              )}
            </>
          )}
        </div>
      </div>
      <div className="ml-11">
        {message.ragResults && message.ragResults.length > 0 && (
          <CitationPanel results={message.ragResults} />
        )}
        {message.usage && (
          <div className="h-5 flex items-center opacity-0 group-hover:opacity-100">
            <span className="text-[11px] text-(--color-label-quaternary) tabular-nums select-none">
              {formatUsage(message.usage)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <MessageActions>
            <CopyButton text={message.content} />
            {voiceOutput && <PlayButton text={message.content} voiceOutput={voiceOutput} />}
            <ActionButton title={t('common.edit')} icon={<Pen className="w-3.5 h-3.5" />} onClick={() => useChatStore.getState().startEditMessage(message.id)} />
            <ActionButton title={t('chat.regenerate')} icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => onRegenerate?.(message.id)} />
            <ActionButton title={t('common.more')} icon={<Ellipsis className="w-3.5 h-3.5" />} onClick={(e) => showMenu(e, message.id)} />
          </MessageActions>
          {message.ownSearchResults && <SearchCitations results={message.ownSearchResults} />}
        </div>
      </div>
    </div>
  );
}
