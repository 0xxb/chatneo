import { useChatStore } from '../store/chat';
import { useModelStore } from '../store/model';
import type { StreamingState } from '../store/chat';
import { getDb } from './db';
import { sanitizeErrorDetail } from './utils';
import { streamChat, nonStreamChat, buildModelMessages } from './chat';
import type { TokenUsage } from './types/chat-message';
import { getSettingValue } from './apply-settings';
import { dispatchOnResponseReceived } from './plugin-runtime';
import type { ToolCallData } from './tool-call-types';
import { resolveModelType } from './model-capabilities';
import { logger } from './logger';
import { searchKnowledgeBases, buildRagContext, getConversationKnowledgeBases } from './knowledge-base';
import { extractSearchResults } from './search-utils';
import { parseSummary } from '../plugins/context-compress/compress';
import i18n from '../locales';
import { resolveChatParams, resolveTools, injectInstructions, WEB_SEARCH_SYSTEM_PROMPT } from './chat-params';
import { formatErrorDetail, persistErrorMessage, persistAssistantMessage } from './chat-persistence';
import { runImageStrategy, runVideoStrategy } from './chat-media';

// Re-export for Home.tsx consumers
export { dbMessagesToDisplayMessages, saveUserMessage } from './chat-persistence';

/**
 * Request an assistant reply for the given conversation.
 * Each conversation streams independently.
 */
async function requestAssistantReply(convId: string) {
  const state = useChatStore.getState();
  const modelState = useModelStore.getState();
  if (modelState.selectedProviderId === null || !modelState.selectedModelId) return;

  const abortController = new AbortController();
  const streamingMsgId = crypto.randomUUID();

  const { temperature, maxOutputTokens, topP, topK, frequencyPenalty, presencePenalty, seed, stopSequences, maxRetries, timeout, customHeaders, thinkingLevel } = resolveChatParams(modelState);

  useChatStore.getState().setStreaming(convId, {
    content: '',
    thinking: '',
    messageId: streamingMsgId,
    abortController,
    toolCalls: [],
  });

  const { tools, maxSteps } = await resolveTools(
    modelState.resolvedCapabilities.supports_function_calling === true,
  );

  const webSearchEnabled = useModelStore.getState().webSearchEnabled;

  const lastUserRow = [...state.messages].reverse().find((m) => m.role === 'user');
  const lastUserMsg = lastUserRow?.content ?? '';

  // --- Image / Video generation branch ---
  const outputType = resolveModelType(modelState.resolvedCapabilities);

  if (outputType === 'image') {
    await runImageStrategy({
      convId, providerId: modelState.selectedProviderId, modelId: modelState.selectedModelId,
      streamingMsgId, abortController, lastUserRow, seed,
    });
    return;
  }

  if (outputType === 'video') {
    await runVideoStrategy({
      convId, providerId: modelState.selectedProviderId, modelId: modelState.selectedModelId,
      streamingMsgId, abortController, lastUserRow, seed,
    });
    return;
  }

  // --- Text chat branch ---
  const contextLimit = getSettingValue('context_message_count') ?? 'all';
  const chatMessages = contextLimit === 'all'
    ? state.messages
    : state.messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-Number(contextLimit));

  let summary: { content: string; compressed_count: number } | undefined;
  if (contextLimit === 'all') {
    const conv = state.conversations.find((c) => c.id === convId);
    summary = parseSummary(conv?.summary) ?? undefined;
  }

  // --- RAG ---
  let ragContext = '';
  let ragResultsJson = '';
  const kbIds = [...useModelStore.getState().selectedKnowledgeBaseIds];
  try {
    const persistentKbs = await getConversationKnowledgeBases(convId);
    for (const kb of persistentKbs) {
      if (!kbIds.includes(kb.id)) kbIds.push(kb.id);
    }
  } catch (e) {
    logger.error('rag', `加载对话知识库关联失败: ${e}`);
  }
  if (kbIds.length > 0 && lastUserMsg) {
    try {
      const ragResults = await searchKnowledgeBases(kbIds, lastUserMsg);
      ragContext = buildRagContext(ragResults);
      logger.info('rag', `RAG 检索完成: 命中 ${ragResults.length} 个分段`);
      if (ragResults.length > 0) {
        ragResultsJson = JSON.stringify(ragResults);
      }
    } catch (err) {
      logger.error('rag', `RAG 检索失败: ${err}`);
    }
  }

  if (ragResultsJson) {
    useChatStore.setState((s) => {
      const entry = s.streamingMap.get(convId);
      if (!entry || ('type' in entry)) return s;
      const next = new Map(s.streamingMap);
      next.set(convId, { ...entry, ragResultsJson });
      return { streamingMap: next };
    });
  }

  const messages = await buildModelMessages(chatMessages, summary);

  if (ragContext) {
    messages.unshift({ role: 'system', content: ragContext } as import('ai').ModelMessage);
  }

  await injectInstructions(convId, messages);

  if (webSearchEnabled && tools?.['web-search']) {
    messages.push({ role: 'system', content: WEB_SEARCH_SYSTEM_PROMPT } as import('ai').ModelMessage);
  }

  const isStreamingEnabled = (getSettingValue('streaming_enabled') ?? '1') === '1';

  const chatParams = {
    providerId: modelState.selectedProviderId,
    modelId: modelState.selectedModelId,
    messages,
    abortSignal: abortController.signal,
    thinkingLevel, temperature, maxOutputTokens, topP, topK, frequencyPenalty, presencePenalty, stopSequences, seed, maxRetries, timeout, customHeaders, tools, maxSteps,
    async onFinish(fullText: string, thinking?: string, toolCalls?: ToolCallData[], usage?: TokenUsage) {
      const currentStream = useChatStore.getState().streamingMap.get(convId);
      if (!currentStream || ('type' in currentStream) || currentStream.messageId !== streamingMsgId) return;

      const partsJson = toolCalls && toolCalls.length > 0 ? JSON.stringify(toolCalls) : '';
      const usageJson = usage ? JSON.stringify(usage) : null;
      const wsResults = toolCalls ? extractSearchResults(toolCalls) : [];
      const searchResultsJson = wsResults.length > 0 ? JSON.stringify(wsResults) : '';

      await persistAssistantMessage({
        convId, messageId: streamingMsgId, content: fullText,
        thinking, partsJson, usageJson, ragResultsJson, searchResultsJson,
      });

      const arc = useChatStore.getState().autoReadCallback;
      if (getSettingValue('tts_auto_read') === '1' && fullText && arc?.convId === convId) {
        arc.cb(fullText);
      }

      const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
      if (conv) {
        const db = await getDb();
        const convMessages = await db.select<{ role: string; content: string }[]>(
          "SELECT role, content FROM messages WHERE conversation_id = $1 AND role IN ('user', 'assistant') ORDER BY created_at ASC",
          [convId],
        );
        dispatchOnResponseReceived({
          conversationId: convId, conversation: conv,
          messages: convMessages,
          assistantMessage: fullText, userMessage: lastUserMsg,
        }).catch((e) => {
          logger.warn('plugin', `插件 onResponseReceived 回调失败: convId=${convId}, error=${e}`);
        });
      }
    },
    onError(error: Error) {
      useChatStore.getState().setStreaming(convId, null);
      logger.error('chat', `AI 回复失败: convId=${convId}, error=${error.message}`);
      let detail = formatErrorDetail(error);
      if (error.message === 'Load failed' || error.message === 'Failed to fetch') {
        detail += '\n\n' + i18n.t('chat.networkError');
      }
      persistErrorMessage(convId, detail);
    },
  };

  if (isStreamingEnabled) {
    await streamChat({
      ...chatParams,
      onChunk(fullText) {
        useChatStore.getState().updateStreamingContent(convId, fullText);
      },
      onThinkingChunk(fullThinking) {
        useChatStore.getState().updateStreamingThinking(convId, fullThinking);
      },
      onToolCallChunk(toolCalls) {
        const store = useChatStore.getState();
        store.updateStreamingToolCalls(convId, toolCalls);
        if (!toolCalls.some((tc) => tc.toolName === 'web-search')) return;
        const entry = store.streamingMap.get(convId);
        if (!entry || 'type' in entry) return;
        const isSearching = toolCalls.some((tc) => tc.toolName === 'web-search' && tc.state === 'calling');
        if (isSearching && !entry.mediaType) {
          store.setStreaming(convId, { ...entry, mediaType: 'search', mediaStartTime: Date.now() });
        } else if (!isSearching && entry.mediaType === 'search') {
          store.setStreaming(convId, { ...entry, mediaType: undefined, mediaStartTime: undefined });
        }
      },
    });
  } else {
    await nonStreamChat({
      ...chatParams,
      async onFinish(fullText, thinking, usage) {
        await chatParams.onFinish(fullText, thinking, undefined, usage);
      },
    });
  }
}

/** Mark a comparison stream model as finished. */
function markComparisonFinished(convId: string, modelKey: string) {
  useChatStore.setState((s) => {
    const entry = s.streamingMap.get(convId);
    if (!entry || !('type' in entry) || entry.type !== 'comparison') return s;
    const nextFinished = new Set(entry.finishedKeys);
    nextFinished.add(modelKey);
    const next = new Map(s.streamingMap);
    next.set(convId, { ...entry, finishedKeys: nextFinished });
    return { streamingMap: next };
  });
}

/** 对比模式：并发请求两个模型的回复 */
async function requestComparisonReply(
  convId: string,
  models: Array<{ providerId: number; modelId: string }>,
) {
  const state = useChatStore.getState();

  const streams = new Map<string, StreamingState>();
  for (const m of models) {
    const modelKey = `${m.providerId}:${m.modelId}`;
    streams.set(modelKey, {
      content: '', thinking: '', messageId: crypto.randomUUID(),
      abortController: new AbortController(), toolCalls: [],
    });
  }

  useChatStore.getState().setComparisonStreaming(convId, {
    type: 'comparison', streams, finishedKeys: new Set(),
  });

  const mState = useModelStore.getState();
  const { temperature, maxOutputTokens, topP, topK, frequencyPenalty, presencePenalty, seed, stopSequences, maxRetries, timeout, customHeaders, thinkingLevel } = resolveChatParams(mState);

  const contextLimit = getSettingValue('context_message_count') ?? 'all';
  const chatMessages = contextLimit === 'all'
    ? state.messages
    : state.messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-Number(contextLimit));

  let summary: { content: string; compressed_count: number } | undefined;
  if (contextLimit === 'all') {
    const conv = state.conversations.find((c) => c.id === convId);
    summary = parseSummary(conv?.summary) ?? undefined;
  }

  const messages = await buildModelMessages(chatMessages, summary);

  // --- RAG (same logic as single mode) ---
  const lastUserRow = [...state.messages].reverse().find((m) => m.role === 'user');
  const lastUserMsg = lastUserRow?.content ?? '';
  const kbIds = [...useModelStore.getState().selectedKnowledgeBaseIds];
  try {
    const persistentKbs = await getConversationKnowledgeBases(convId);
    for (const kb of persistentKbs) {
      if (!kbIds.includes(kb.id)) kbIds.push(kb.id);
    }
  } catch (e) {
    logger.error('rag', `加载对话知识库关联失败: ${e}`);
  }
  let ragResultsJson = '';
  if (kbIds.length > 0 && lastUserMsg) {
    try {
      const ragResults = await searchKnowledgeBases(kbIds, lastUserMsg);
      const ragContext = buildRagContext(ragResults);
      if (ragContext) {
        messages.unshift({ role: 'system', content: ragContext } as import('ai').ModelMessage);
      }
      if (ragResults.length > 0) ragResultsJson = JSON.stringify(ragResults);
      logger.info('rag', `对比模式 RAG 检索完成: 命中 ${ragResults.length} 个分段`);
    } catch (err) {
      logger.error('rag', `对比模式 RAG 检索失败: ${err}`);
    }
  }
  // 把 ragResultsJson 回写到每个 stream，确保 stop/adopt 落库 + 视图展示都能拿到引用。
  if (ragResultsJson) {
    useChatStore.setState((s) => {
      const entry = s.streamingMap.get(convId);
      if (!entry || !('type' in entry) || entry.type !== 'comparison') return s;
      const nextStreams = new Map<string, StreamingState>();
      for (const [k, v] of entry.streams) nextStreams.set(k, { ...v, ragResultsJson });
      const next = new Map(s.streamingMap);
      next.set(convId, { ...entry, streams: nextStreams });
      return { streamingMap: next };
    });
  }

  await injectInstructions(convId, messages);

  const { tools, maxSteps } = await resolveTools(
    mState.resolvedCapabilities.supports_function_calling === true,
  );
  const webSearchEnabled = useModelStore.getState().webSearchEnabled;

  if (webSearchEnabled && tools?.['web-search']) {
    messages.push({ role: 'system', content: WEB_SEARCH_SYSTEM_PROMPT } as import('ai').ModelMessage);
  }

  const isStreamingEnabled = (getSettingValue('streaming_enabled') ?? '1') === '1';

  const promises = models.map(async (m) => {
    const modelKey = `${m.providerId}:${m.modelId}`;
    const streamState = streams.get(modelKey)!;

    const chatParams = {
      providerId: m.providerId, modelId: m.modelId, messages,
      abortSignal: streamState.abortController.signal,
      thinkingLevel, temperature, maxOutputTokens, topP, topK, frequencyPenalty, presencePenalty, stopSequences, seed, maxRetries, timeout, customHeaders, tools, maxSteps,
      async onFinish(_fullText: string, _thinking?: string, _toolCalls?: ToolCallData[], _usage?: TokenUsage) {
        markComparisonFinished(convId, modelKey);
      },
      onError(error: Error) {
        logger.error('chat', `对比模式回复失败: modelKey=${modelKey}, error=${error.message}`);
        let detail = formatErrorDetail(error);
        if (error.message === 'Load failed' || error.message === 'Failed to fetch') {
          detail += '\n\n' + i18n.t('chat.networkError');
        }
        useChatStore.getState().updateComparisonStreamContent(
          convId, modelKey, `**Error:** ${sanitizeErrorDetail(detail)}`,
        );
        markComparisonFinished(convId, modelKey);
      },
    };

    if (isStreamingEnabled) {
      await streamChat({
        ...chatParams,
        onChunk(fullText) { useChatStore.getState().updateComparisonStreamContent(convId, modelKey, fullText); },
        onThinkingChunk(fullThinking) { useChatStore.getState().updateComparisonStreamThinking(convId, modelKey, fullThinking); },
        onToolCallChunk(toolCalls) { useChatStore.getState().updateComparisonStreamToolCalls(convId, modelKey, toolCalls); },
      });
    } else {
      await nonStreamChat({
        ...chatParams,
        async onFinish(fullText, thinking, usage) {
          useChatStore.getState().updateComparisonStreamContent(convId, modelKey, fullText);
          if (thinking) useChatStore.getState().updateComparisonStreamThinking(convId, modelKey, thinking);
          await chatParams.onFinish(fullText, thinking, undefined, usage);
        },
      });
    }
  });

  await Promise.allSettled(promises);
}

/** Dispatch reply — routes to comparison or single model based on current state. */
export async function requestReply(convId: string) {
  const ms = useModelStore.getState();
  const comparisonModel = ms.comparisonModel;
  if (comparisonModel) {
    await requestComparisonReply(convId, [
      { providerId: ms.selectedProviderId!, modelId: ms.selectedModelId! },
      comparisonModel,
    ]);
  } else {
    await requestAssistantReply(convId);
  }
}
