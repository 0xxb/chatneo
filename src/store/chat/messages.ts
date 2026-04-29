import { deleteAttachmentFile } from '../../lib/attachments';
import { getPartsMediaPaths } from '../../lib/message-parts';
import { logger } from '../../lib/logger';
import type { ChatState, ChatSlice, MessageRow } from './types';
import {
  updateMessageContent as daoUpdateMessageContent,
  updateAssistantMessageContent,
  deleteMessagesByIds,
  deleteMessagesByConversation,
  deleteMessage,
  getAttachmentPathsByMessageIds,
} from '../../lib/dao/message-dao';
import { clearConversationSummary } from '../../lib/dao/conversation-dao';

/** Fire-and-forget delete of file paths (attachments + generated media from `parts`). */
function cleanupFiles(paths: string[], context: string) {
  if (paths.length === 0) return;
  Promise.all(paths.map((p) => deleteAttachmentFile(p))).catch((e) => {
    logger.warn('attachment', `${context}: error=${e}`);
  });
}

/**
 * 编辑/删除/清空后清除会话 summary：旧摘要可能已不覆盖当前消息，继续注入会污染模型上下文。
 * 压缩插件发现 summary 存在就不再自动建议，所以这里必须主动清空。
 */
function clearSummaryInState(s: ChatState, convId: string): Partial<ChatState> {
  const clear = (c: typeof s.conversations[number]) =>
    c.id === convId ? { ...c, summary: '' } : c;
  return {
    conversations: s.conversations.some((c) => c.id === convId)
      ? s.conversations.map(clear)
      : s.conversations,
    archivedConversations: s.archivedConversations.some((c) => c.id === convId)
      ? s.archivedConversations.map(clear)
      : s.archivedConversations,
  };
}

/** Batch delete messages from a given index, return the remaining messages. */
async function deleteMessagesFromDb(
  messages: MessageRow[],
  fromIndex: number,
) {
  const msgsToDelete = messages.slice(fromIndex);
  if (msgsToDelete.length > 0) {
    const ids = msgsToDelete.map((m) => m.id);
    await deleteMessagesByIds(ids);
  }
  return messages.slice(0, fromIndex);
}

export const createMessagesSlice: ChatSlice = (set, get) => ({
  messages: [],
  editingMessageId: null,
  autoReadCallback: null as { convId: string; cb: (text: string) => void } | null,
  setAutoReadCallback(convId: string, cb: ((text: string) => void) | null) {
    set(() => ({ autoReadCallback: cb ? { convId, cb } : null }));
  },

  startEditMessage(messageId: string) {
    set(() => ({ editingMessageId: messageId }));
  },

  cancelEditMessage() {
    set(() => ({ editingMessageId: null }));
  },

  async updateMessageContent(messageId: string, content: string) {
    const { messages, activeConversationId } = get();
    const original = messages.find((m) => m.id === messageId);
    if (!original) return;
    // Assistant 编辑：用户提供的新文本覆盖一切语义元数据；否则 thinking/toolCalls/citations/mediaParts
    // 仍按旧值渲染（媒体场景下甚至完全盖住新内容），会让"编辑"名不副实。
    const isAssistant = original.role === 'assistant';
    const applyEdit = (m: MessageRow) => isAssistant
      ? { ...m, content, thinking: '', parts: '', token_count: null, rag_results: '', search_results: '', attachments: undefined }
      : { ...m, content };
    set((s) => ({ messages: s.messages.map((m) => m.id === messageId ? applyEdit(m) : m) }));
    try {
      if (isAssistant) {
        await updateAssistantMessageContent(messageId, content);
      } else {
        await daoUpdateMessageContent(messageId, content);
      }
      if (activeConversationId) {
        await clearConversationSummary(activeConversationId);
        set((s) => clearSummaryInState(s, activeConversationId));
      }
    } catch (e) {
      logger.error('message', `更新消息内容失败: messageId=${messageId}, error=${e}`);
      set((s) => ({ messages: s.messages.map((m) => m.id === messageId ? original : m) }));
      throw e;
    }
  },

  async deleteMessagesFrom(messageId: string) {
    const { messages, activeConversationId } = get();
    if (!activeConversationId) return messages;

    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return messages;

    const msgsToDelete = messages.slice(msgIndex);
    const ids = msgsToDelete.map((m) => m.id);
    if (ids.length > 0) {
      const attPaths = await getAttachmentPathsByMessageIds(ids);
      // 收集附件路径 + parts 中的生成媒体路径，一并清理孤儿文件。
      const paths = [
        ...attPaths,
        ...msgsToDelete.flatMap((m) => getPartsMediaPaths(m.parts)),
      ];
      cleanupFiles(paths, `清理删除消息文件失败: ids=${ids.length}`);
    }

    const remaining = await deleteMessagesFromDb(messages, msgIndex);
    // 删除会改变被压缩的消息范围（或直接砍掉压缩后的尾部），旧摘要不再一致。
    await clearConversationSummary(activeConversationId);
    set((s) => ({ messages: remaining, ...clearSummaryInState(s, activeConversationId) }));
    return remaining;
  },

  async clearMessages() {
    const { activeConversationId, messages, streamingMap } = get();
    if (!activeConversationId) return;
    logger.warn('conversation', `清空消息: convId=${activeConversationId}`);

    if (streamingMap.has(activeConversationId)) {
      await get().stopAnyStreaming(activeConversationId);
    }

    const attPaths = await getAttachmentPathsByMessageIds(messages.map((m) => m.id));
    // 附件 + 生成媒体都需要清理，否则清空会话后会留下孤儿文件。
    const paths = [
      ...attPaths,
      ...messages.flatMap((m) => getPartsMediaPaths(m.parts)),
    ];
    cleanupFiles(paths, `清理消息文件失败: convId=${activeConversationId}`);
    await deleteMessagesByConversation(activeConversationId);
    await clearConversationSummary(activeConversationId);

    set((s) => ({ messages: [], editingMessageId: null, ...clearSummaryInState(s, activeConversationId) }));
  },

  async deleteSingleMessage(messageId: string) {
    const { messages, activeConversationId } = get();
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    const paths = [
      ...(msg.attachments?.map((a) => a.path) ?? []),
      ...getPartsMediaPaths(msg.parts),
    ];
    cleanupFiles(paths, `清理消息文件失败: messageId=${messageId}`);

    await deleteMessage(messageId);
    if (activeConversationId) {
      await clearConversationSummary(activeConversationId);
    }
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== messageId),
      ...(activeConversationId ? clearSummaryInState(s, activeConversationId) : {}),
    }));
  },
});
