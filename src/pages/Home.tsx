import { useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import MessageInput from '../components/MessageInput';
import ChatMessage from '../components/ChatMessage';
import type { ChatMessageData } from '../components/ChatMessage';
import ComparisonMessage from '../components/ChatMessage/ComparisonMessage';
import type { ComparisonModel } from '../components/ChatMessage/ComparisonMessage';
import LoadingMessage from '../components/ChatMessage/LoadingMessage';
import EmptyState from '../components/Chat/EmptyState';
import { useChatStore } from '../store/chat';
import { useModelStore } from '../store/model';
import type { StreamingState, ComparisonStreamingState } from '../store/chat';
import { safeJsonParse } from '../lib/utils';
import type { SearchResult } from '../lib/knowledge-base';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { parseSummary } from '../plugins/context-compress/compress';
import { useProviderIconMap } from '../hooks/useProviderIconMap';
import { useVoiceOutput } from '../hooks/useVoiceOutput';
import { useModels } from '../hooks/useModels';
import type { ToolCallData } from '../lib/tool-call-types';
import SummaryCard from '../components/Chat/SummaryCard';
import { extractSearchResults } from '../components/ChatMessage/search-utils';
import { dbMessagesToDisplayMessages } from '../lib/chat-orchestrator';
import { useChatActions } from '../hooks/useChatActions';

const EMPTY_TOOL_CALLS: ToolCallData[] = [];
const MESSAGES_CONTAINER_STYLE = { gap: 'var(--chat-message-gap, 2rem)' } as const;

/** Scrolls to bottom when a new user message appears. Must be inside StickToBottom. */
function ScrollOnUserSend({ messages }: { messages: ChatMessageData[] }) {
  const { scrollToBottom } = useStickToBottomContext();
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.role === 'user' && last.id !== lastIdRef.current) {
      scrollToBottom('instant');
    }
    lastIdRef.current = last?.id ?? null;
  }, [messages, scrollToBottom]);
  return null;
}

function Home() {
  const { t } = useTranslation();
  const {
    handleStop, handleAdopt, handleClearMessages, handleSend,
    handleRegenerate, handleBranchConversation, handleDeleteMessage, handleEditMessage,
  } = useChatActions();

  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const dbMessages = useChatStore((s) => s.messages);
  const activeStreaming = useChatStore((s) =>
    s.activeConversationId ? s.streamingMap.get(s.activeConversationId) : undefined,
  );
  const selectedProviderId = useModelStore((s) => s.selectedProviderId);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const getProviderIcon = useProviderIconMap();
  const providerIcon = useMemo(
    () => getProviderIcon(selectedProviderId, selectedModelId),
    [getProviderIcon, selectedProviderId, selectedModelId],
  );

  const activeSummary = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId)?.summary,
  );
  const parsedSummary = useMemo(() => parseSummary(activeSummary), [activeSummary]);

  useTauriEvent('conversation-summary-updated', () => {
    useChatStore.getState().loadConversations();
  });

  const voiceOutput = useVoiceOutput();
  const setAutoReadCallback = useChatStore((s) => s.setAutoReadCallback);

  useEffect(() => {
    if (activeConversationId) {
      setAutoReadCallback(activeConversationId, voiceOutput.play);
    }
    return () => { setAutoReadCallback('', null); };
  }, [voiceOutput.play, activeConversationId, setAutoReadCallback]);

  const activeSingleStreaming = activeStreaming && !('type' in activeStreaming) ? activeStreaming : undefined;
  const comparisonModel = useModelStore((s) => s.comparisonModel);

  const isComparisonStreaming = activeStreaming && 'type' in activeStreaming && activeStreaming.type === 'comparison';
  const comparisonState = isComparisonStreaming ? (activeStreaming as ComparisonStreamingState) : null;
  const allComparisonFinished = comparisonState
    ? comparisonState.finishedKeys.size === comparisonState.streams.size
    : false;

  const isStreaming = !!activeStreaming;
  const streamingContent = activeSingleStreaming?.content ?? '';
  const streamingThinking = activeSingleStreaming?.thinking ?? '';
  const streamingToolCalls = activeSingleStreaming?.toolCalls ?? EMPTY_TOOL_CALLS;
  const onlyWebSearchTools = streamingToolCalls.length === 0 || streamingToolCalls.every((tc) => tc.toolName === 'web-search');
  const showLoading = isStreaming && !isComparisonStreaming && !streamingContent && !streamingThinking && onlyWebSearchTools;

  const historicalMessages = useMemo(() => {
    if (!activeConversationId || dbMessages.length === 0) return [];
    const skipCount = parsedSummary ? Math.min(parsedSummary.compressed_count, dbMessages.length) : 0;
    return dbMessagesToDisplayMessages(dbMessages.slice(skipCount));
  }, [activeConversationId, dbMessages, parsedSummary]);

  const streamingSearchResults = useMemo(() => {
    if (streamingToolCalls.length === 0) return undefined;
    const results = extractSearchResults(streamingToolCalls);
    return results.length > 0 ? results : undefined;
  }, [streamingToolCalls]);

  const displayMessages = useMemo(() => {
    if (!isStreaming || (!streamingContent && !streamingThinking && streamingToolCalls.length === 0)) {
      return historicalMessages;
    }
    const prev = historicalMessages[historicalMessages.length - 1]?.searchResults;
    const searchResults = streamingSearchResults
      ? prev ? [...prev, ...streamingSearchResults] : streamingSearchResults
      : prev;
    return [...historicalMessages, {
      id: 'streaming',
      role: 'assistant' as const,
      content: streamingContent,
      thinking: streamingThinking || undefined,
      toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : undefined,
      isToolCalling: streamingToolCalls.some((tc) => tc.state === 'calling'),
      isStreaming: true,
      isThinkingActive: !!streamingThinking && !streamingContent,
      searchResults,
      ownSearchResults: streamingSearchResults,
    }];
  }, [historicalMessages, isStreaming, streamingContent, streamingThinking, streamingToolCalls, streamingSearchResults]);

  const { models: rawModels } = useModels();

  const comparisonDisplayData = useMemo(() => {
    if (!comparisonState || !comparisonModel || !selectedProviderId || !selectedModelId) return null;

    const primaryKey = `${selectedProviderId}:${selectedModelId}`;
    const compKey = `${comparisonModel.providerId}:${comparisonModel.modelId}`;

    const primaryStream = comparisonState.streams.get(primaryKey);
    const compStream = comparisonState.streams.get(compKey);
    if (!primaryStream || !compStream) return null;

    const findModel = (pid: number, mid: string) => {
      const m = rawModels.find((rm) => rm.providerId === pid && rm.modelId === mid);
      return {
        providerId: pid,
        modelId: mid,
        modelName: m?.modelName ?? mid,
        providerIcon: m?.providerIcon ?? '',
      };
    };

    const toMessageData = (s: StreamingState): ChatMessageData => {
      const own = s.toolCalls.length > 0 ? extractSearchResults(s.toolCalls) : [];
      const rag = s.ragResultsJson ? safeJsonParse<SearchResult[]>(s.ragResultsJson, []) : [];
      return {
        id: s.messageId,
        role: 'assistant',
        content: s.content,
        thinking: s.thinking || undefined,
        toolCalls: s.toolCalls.length > 0 ? s.toolCalls : undefined,
        isToolCalling: s.toolCalls.some((tc) => tc.state === 'calling'),
        isStreaming: !allComparisonFinished,
        isThinkingActive: !!s.thinking && !s.content,
        ragResults: rag.length > 0 ? rag : undefined,
        ownSearchResults: own.length > 0 ? own : undefined,
      };
    };

    return {
      models: [
        findModel(selectedProviderId, selectedModelId),
        findModel(comparisonModel.providerId, comparisonModel.modelId),
      ] as [ComparisonModel, ComparisonModel],
      messages: [toMessageData(primaryStream), toMessageData(compStream)] as [ChatMessageData, ChatMessageData],
    };
  }, [comparisonState, comparisonModel, selectedProviderId, selectedModelId, rawModels, allComparisonFinished]);

  const editingMessageId = useChatStore((s) => s.editingMessageId);
  const isEditing = editingMessageId !== null;
  const showEmpty = !activeConversationId && displayMessages.length === 0;

  if (showEmpty) {
    return (
      <div className="chat-bg-container h-full flex flex-col">
        <div className="flex-1 min-h-0">
          <EmptyState />
        </div>
        <div className="shrink-0 max-w-5xl mx-auto w-full">
          <MessageInput
            onSend={handleSend}
            disabled={isStreaming}
            onStop={handleStop}
            onEditMessage={handleEditMessage}
            onClearMessages={handleClearMessages}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="chat-bg-container h-full overflow-hidden">
    <StickToBottom className="h-full overflow-y-auto">
      <StickToBottom.Content className="min-h-full flex flex-col max-w-5xl mx-auto">
        <ScrollOnUserSend messages={displayMessages} />
        <div className="flex-1 px-4 pt-12 pb-6 flex flex-col isolate" style={MESSAGES_CONTAINER_STYLE} data-messages-container>
          {parsedSummary && (
            <SummaryCard
              compressedCount={parsedSummary.compressed_count}
              content={parsedSummary.content}
            />
          )}
          {displayMessages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              providerIcon={providerIcon}
              voiceOutput={voiceOutput}
              onRegenerate={handleRegenerate}
              onEditMessage={handleEditMessage}
              onBranchConversation={handleBranchConversation}
              onDeleteMessage={handleDeleteMessage}
            />
          ))}
          {isComparisonStreaming && comparisonDisplayData && (
            <ComparisonMessage
              models={comparisonDisplayData.models}
              messages={comparisonDisplayData.messages}
              allFinished={allComparisonFinished}
              onAdopt={handleAdopt}
            />
          )}
          {showLoading && (
            <LoadingMessage providerIcon={providerIcon} mediaType={activeSingleStreaming?.mediaType} startTime={activeSingleStreaming?.mediaStartTime} />
          )}
        </div>
        {!isEditing && (
          <div className="sticky bottom-0 z-10">
            {!!comparisonModel && !isStreaming && (
              <div className="text-center text-xs text-(--color-label-tertiary) py-1">
                {t('chat.comparisonHint')}
              </div>
            )}
            <MessageInput
              key={activeConversationId ?? 'new'}
              onSend={handleSend}
              disabled={isStreaming}
              onStop={handleStop}
              onEditMessage={handleEditMessage}
              onClearMessages={handleClearMessages}
            />
          </div>
        )}
      </StickToBottom.Content>
    </StickToBottom>
    </div>
  );
}

export default Home;
