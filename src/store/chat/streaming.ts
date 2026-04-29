import { extractSearchResults } from '../../lib/search-utils';
import { nowUnix } from '../../lib/utils';
import { logger } from '../../lib/logger';
import type { ToolCallData } from '../../lib/tool-call-types';
import type { ChatState, ChatSlice, MessageRow, StreamingState } from './types';
import { insertMessage } from '../../lib/dao/message-dao';
import { updateConversationTimestamp } from '../../lib/dao/conversation-dao';

function patchStreaming(
  set: (fn: (s: ChatState) => Partial<ChatState>) => void,
  convId: string,
  patch: Partial<StreamingState>,
) {
  set((s) => {
    const entry = s.streamingMap.get(convId);
    if (!entry || ('type' in entry && entry.type === 'comparison')) return s;
    const next = new Map(s.streamingMap);
    next.set(convId, { ...entry, ...patch });
    return { streamingMap: next };
  });
}

function patchComparisonStream(
  set: (fn: (s: ChatState) => Partial<ChatState>) => void,
  convId: string,
  modelKey: string,
  patch: Partial<StreamingState>,
) {
  set((s) => {
    const entry = s.streamingMap.get(convId);
    if (!entry || !('type' in entry) || entry.type !== 'comparison') return s;
    const stream = entry.streams.get(modelKey);
    if (!stream) return s;
    const nextStreams = new Map(entry.streams);
    nextStreams.set(modelKey, { ...stream, ...patch });
    const next = new Map(s.streamingMap);
    next.set(convId, { ...entry, streams: nextStreams });
    return { streamingMap: next };
  });
}

/** Build an assistant MessageRow from a stopped streaming state. */
function buildAssistantMessageRow(
  stream: StreamingState,
  convId: string,
  createdAt: number,
): MessageRow {
  const partsJson = stream.toolCalls.length > 0 ? JSON.stringify(stream.toolCalls) : '';
  const wsResults = extractSearchResults(stream.toolCalls);
  const searchResultsJson = wsResults.length > 0 ? JSON.stringify(wsResults) : '';
  return {
    id: stream.messageId,
    conversation_id: convId,
    role: 'assistant',
    content: stream.content,
    thinking: stream.thinking || '',
    parts: partsJson,
    token_count: null,
    rag_results: stream.ragResultsJson || '',
    search_results: searchResultsJson,
    created_at: createdAt,
  };
}

async function insertAssistantMessage(msg: MessageRow) {
  await insertMessage({
    id: msg.id,
    conversationId: msg.conversation_id,
    role: msg.role,
    content: msg.content,
    thinking: msg.thinking,
    parts: msg.parts,
    tokenCount: msg.token_count,
    ragResults: msg.rag_results,
    searchResults: msg.search_results,
    createdAt: msg.created_at,
  });
}

export const createStreamingSlice: ChatSlice = (set, get) => ({
  streamingMap: new Map(),

  setStreaming(convId, state) {
    set((s) => {
      const next = new Map(s.streamingMap);
      if (state) {
        next.set(convId, state);
      } else {
        next.delete(convId);
      }
      return { streamingMap: next };
    });
  },

  updateStreamingContent(convId: string, content: string) {
    patchStreaming(set, convId, { content });
  },

  updateStreamingThinking(convId: string, thinking: string) {
    patchStreaming(set, convId, { thinking });
  },

  updateStreamingToolCalls(convId: string, toolCalls: ToolCallData[]) {
    patchStreaming(set, convId, { toolCalls });
  },

  async stopStreaming(convId: string) {
    const { streamingMap } = get();
    const entry = streamingMap.get(convId);
    if (!entry || 'type' in entry) return;

    // Clear streaming map FIRST so onFinish callback will bail out via the guard check
    const { content, thinking, abortController } = entry;
    get().setStreaming(convId, null);
    abortController.abort();
    logger.info('streaming', `用户停止流式传输: convId=${convId}, 已生成内容长度=${content.length}`);

    if (!content && !thinking) return;

    const now = nowUnix();
    const msg = buildAssistantMessageRow(entry, convId, now);

    set((s) => {
      if (s.activeConversationId !== convId) return s;
      if (s.messages.some((m) => m.id === msg.id)) return s;
      return { messages: [...s.messages, msg] };
    });

    // 调用方（deleteConversation / clearMessages / regenerate / edit）会在 await 后对同一 conv 做 DELETE/INSERT，
    // 必须先等这里的 INSERT 落库，否则会出现写入顺序错乱或孤儿行。
    try {
      await insertAssistantMessage(msg);
      await updateConversationTimestamp(convId, now);
    } catch (e) {
      logger.error('streaming', `消息持久化失败: convId=${convId}, error=${e}`);
    }
  },

  setComparisonStreaming(convId, state) {
    set((s) => {
      const next = new Map(s.streamingMap);
      if (state) {
        next.set(convId, state);
      } else {
        next.delete(convId);
      }
      return { streamingMap: next };
    });
  },

  updateComparisonStreamContent(convId: string, modelKey: string, content: string) {
    patchComparisonStream(set, convId, modelKey, { content });
  },

  updateComparisonStreamThinking(convId: string, modelKey: string, thinking: string) {
    patchComparisonStream(set, convId, modelKey, { thinking });
  },

  updateComparisonStreamToolCalls(convId: string, modelKey: string, toolCalls: ToolCallData[]) {
    patchComparisonStream(set, convId, modelKey, { toolCalls });
  },

  async stopAnyStreaming(convId: string) {
    const entry = get().streamingMap.get(convId);
    if (!entry) return;
    if ('type' in entry && entry.type === 'comparison') await get().stopComparisonStreaming(convId);
    else await get().stopStreaming(convId);
  },

  async stopComparisonStreaming(convId: string) {
    const entry = get().streamingMap.get(convId);
    if (!entry || !('type' in entry) || entry.type !== 'comparison') return;

    const streamsSnapshot = new Map(entry.streams);
    for (const stream of streamsSnapshot.values()) {
      stream.abortController.abort();
    }
    set((s) => {
      const next = new Map(s.streamingMap);
      next.delete(convId);
      return { streamingMap: next };
    });

    const now = nowUnix();
    const msgs: MessageRow[] = [];
    let i = 0;
    for (const [, stream] of streamsSnapshot) {
      if (!stream.content && !stream.thinking) continue;
      // 错开 1s，避免同秒写入导致 ORDER BY created_at 取不到稳定顺序。
      msgs.push(buildAssistantMessageRow(stream, convId, now + i));
      i++;
    }
    if (msgs.length === 0) return;

    // 同步到 messages store，避免用户在当前窗口里看到消息"消失"。
    set((s) => {
      if (s.activeConversationId !== convId) return s;
      const existingIds = new Set(s.messages.map((m) => m.id));
      const fresh = msgs.filter((m) => !existingIds.has(m.id));
      return fresh.length > 0 ? { messages: [...s.messages, ...fresh] } : s;
    });

    try {
      for (const msg of msgs) await insertAssistantMessage(msg);
      await updateConversationTimestamp(convId, now + i);
    } catch (e) {
      logger.error('streaming', `对比模式消息持久化失败: convId=${convId}, error=${e}`);
    }
  },
});
