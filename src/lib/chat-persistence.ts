import { useChatStore } from '../store/chat';
import type { MessageRow } from '../store/chat';
import type { Attachment } from '../components/MessageInput/types';
import { safeJsonParse, sanitizeErrorDetail, nowUnix } from './utils';
import { parseMessageParts } from './message-parts';
import { saveImageFile, cacheImageDataUrl, copyFileToAttachments, ensureAttachmentsDir } from './attachments';
import type { TokenUsage, ChatMessageData, SearchResultItem } from './types/chat-message';
import type { ToolCallData } from './tool-call-types';
import type { MessagePart } from './message-parts';
import { logger } from './logger';
import * as messageDao from './dao/message-dao';
import * as conversationDao from './dao/conversation-dao';
import * as attachmentDao from './dao/attachment-dao';

/** Persist an assistant message to DB, clear streaming, and update store. */
export async function persistAssistantMessage(opts: {
  convId: string;
  messageId: string;
  content: string;
  thinking?: string;
  partsJson?: string;
  usageJson?: string | null;
  ragResultsJson?: string;
  searchResultsJson?: string;
}): Promise<MessageRow> {
  const now = nowUnix();
  await messageDao.insertMessage({
    id: opts.messageId,
    conversationId: opts.convId,
    role: 'assistant',
    content: opts.content,
    thinking: opts.thinking || '',
    parts: opts.partsJson || '',
    tokenCount: opts.usageJson ?? null,
    ragResults: opts.ragResultsJson || '',
    searchResults: opts.searchResultsJson || '',
    createdAt: now,
  });
  await conversationDao.updateConversationTimestamp(opts.convId, now);

  const msg: MessageRow = {
    id: opts.messageId, conversation_id: opts.convId, role: 'assistant',
    content: opts.content, thinking: opts.thinking || '', parts: opts.partsJson || '',
    token_count: opts.usageJson ?? null, rag_results: opts.ragResultsJson || '',
    search_results: opts.searchResultsJson || '', created_at: now,
  };

  useChatStore.getState().setStreaming(opts.convId, null);
  if (useChatStore.getState().activeConversationId === opts.convId) {
    useChatStore.setState((s) => ({ messages: [...s.messages, msg] }));
  }
  await useChatStore.getState().loadConversations();

  return msg;
}

/** Convert DB MessageRows to ChatMessageData for display. */
export function dbMessagesToDisplayMessages(messages: MessageRow[]): ChatMessageData[] {
  const filtered = messages.filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'error');
  let accumulated: SearchResultItem[] | undefined;
  return filtered.map((m) => {
      let toolCalls: ToolCallData[] | undefined;
      let mediaParts: MessagePart[] | undefined;
      if (m.parts) {
        const mp = parseMessageParts(m.parts);
        if (mp.length > 0) {
          mediaParts = mp;
        } else {
          const parsed = safeJsonParse<ToolCallData[]>(m.parts, []);
          if (parsed.length > 0) toolCalls = parsed;
        }
      }
      const usage = m.token_count ? safeJsonParse<TokenUsage | null>(m.token_count, null) : undefined;
      const ragResults = m.rag_results ? safeJsonParse<import('./knowledge-base').SearchResult[]>(m.rag_results, []) : undefined;
      const ownSearchResults = m.search_results
        ? safeJsonParse<SearchResultItem[]>(m.search_results, [])
        : undefined;
      if (ownSearchResults && ownSearchResults.length > 0) {
        accumulated = accumulated ? [...accumulated, ...ownSearchResults] : ownSearchResults;
      }
      return {
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'error',
        content: m.content,
        thinking: m.thinking || undefined,
        toolCalls,
        mediaParts,
        usage: usage || undefined,
        ragResults: ragResults && ragResults.length > 0 ? ragResults : undefined,
        searchResults: accumulated,
        ownSearchResults: ownSearchResults && ownSearchResults.length > 0 ? ownSearchResults : undefined,
        attachments: m.attachments?.map((a) => ({
          type: a.type,
          url: a.preview ?? '',
          name: a.name,
        })),
      };
    });
}

/** Format error detail for display. */
export function formatErrorDetail(error: Error): string {
  let detail = error.message;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { message: _, name: __, stack: ___, ...rest } = error as any;
  if (Object.keys(rest).length > 0) {
    detail += '\n' + JSON.stringify(rest, null, 2);
  }
  return sanitizeErrorDetail(detail);
}

/** Persist an error message to DB and update UI state. */
export function persistErrorMessage(convId: string, detail: string) {
  const errorMsgId = crypto.randomUUID();
  const now = nowUnix();
  const errorMsg: MessageRow = {
    id: errorMsgId, conversation_id: convId, role: 'error',
    content: detail, thinking: '', parts: '', token_count: null, rag_results: '', search_results: '', created_at: now,
  };

  messageDao.insertErrorMessage(errorMsgId, convId, detail, now).catch((e) => {
    logger.error('chat', `错误消息持久化失败: convId=${convId}, error=${e}`);
  });

  if (useChatStore.getState().activeConversationId === convId) {
    useChatStore.setState((s) => ({ messages: [...s.messages, errorMsg] }));
  }
}

/** Save a user message + attachments to DB and append to store. */
export async function saveUserMessage(convId: string, text: string, attachments: Attachment[]) {
  const attDir = await ensureAttachmentsDir();

  // @ 选择的历史附件 path 已在 attDir 内：若不处理，两条消息会共享同一物理文件，任一删除都会污染另一条。
  const inDirPaths = attachments
    .filter((a) => a.path && a.path.startsWith(attDir))
    .map((a) => a.path!);
  const sharedPaths = await attachmentDao.getSharedPaths(inDirPaths);

  const attResults = await Promise.allSettled(attachments.map(async (att, idx) => {
    if (att.type === 'image' && att.preview?.startsWith('data:') && !att.path) {
      const filePath = await saveImageFile(att.preview);
      cacheImageDataUrl(filePath, att.preview);
      att.path = filePath;
    } else if (att.path && (!att.path.startsWith(attDir) || sharedPaths.has(att.path))) {
      att.path = await copyFileToAttachments(att.path);
    }
    return idx;
  }));
  // Filter out attachments that failed to save
  const validAttachments = attachments.filter((att, idx) => {
    const result = attResults[idx];
    if (result.status === 'rejected') {
      logger.error('attachment', `附件保存失败: ${att.name}, reason=${result.reason}`);
      return false;
    }
    if (!att.path) {
      logger.error('attachment', `附件路径为空: ${att.name}`);
      return false;
    }
    return true;
  });

  const now = nowUnix();
  const userMsgId = crypto.randomUUID();
  await messageDao.insertUserMessage(userMsgId, convId, text, now);
  for (let i = 0; i < validAttachments.length; i++) {
    const att = validAttachments[i];
    await attachmentDao.insertAttachment(crypto.randomUUID(), userMsgId, att.type, att.name, att.path!, i, now);
  }

  const userMsg: MessageRow = {
    id: userMsgId, conversation_id: convId, role: 'user',
    content: text, thinking: '', parts: '', token_count: null, rag_results: '', search_results: '', created_at: now,
    attachments: validAttachments.map((a) => ({
      id: a.id, type: a.type, name: a.name, path: a.path, preview: a.preview,
    })),
  };
  useChatStore.setState((s) => ({ messages: [...s.messages, userMsg] }));
  const attDetail = validAttachments.map((a) => `${a.type}:${a.name}`).join(', ');
  logger.info('message', `用户消息已保存: convId=${convId}, msgId=${userMsgId}, 内容长度=${text.length}, 附件数=${validAttachments.length}${attDetail ? ` [${attDetail}]` : ''}`);
}
