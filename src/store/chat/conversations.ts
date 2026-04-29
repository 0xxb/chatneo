import { deleteAttachmentFile, getAttachmentUrl, copyFileToAttachments } from '../../lib/attachments';
import type { Attachment } from '../../components/MessageInput/types';
import { nowUnix } from '../../lib/utils';
import { logger } from '../../lib/logger';
import i18n from '../../locales';
import { parseMessageParts, getPartsMediaPaths } from '../../lib/message-parts';
import { useModelStore } from '../model';
import type { ChatSlice, ConversationRow } from './types';
import {
  loadConversations as daoLoadConversations,
  searchConversations as daoSearchConversations,
  conversationExists,
  insertConversation,
  deleteConversation as daoDeleteConversation,
  renameConversation as daoRenameConversation,
  toggleConversationPinned,
  toggleConversationArchived,
  loadArchivedConversations as daoLoadArchivedConversations,
  getConversationAttachmentPaths,
  getConversationPartStrings,
} from '../../lib/dao/conversation-dao';
import { getMessages, insertBranchMessage } from '../../lib/dao/message-dao';
import { getAttachmentsByConversation, insertAttachment } from '../../lib/dao/attachment-dao';

const PAGE_SIZE = 30;
let searchVersion = 0;

/** 清理会话下所有消息的附件 + parts 中的生成媒体文件。 */
async function cleanupConversationFiles(conversationId: string) {
  const [attPaths, partStrings] = await Promise.all([
    getConversationAttachmentPaths(conversationId),
    getConversationPartStrings(conversationId),
  ]);
  const paths = [
    ...attPaths,
    ...partStrings.flatMap((p) => getPartsMediaPaths(p)),
  ];
  if (paths.length === 0) return;
  Promise.all(paths.map((p) => deleteAttachmentFile(p))).catch((e) => {
    logger.warn('attachment', `清理对话文件失败: conversationId=${conversationId}, error=${e}`);
  });
}

/**
 * 复制 parts JSON 中的媒体文件，返回重写路径后的 JSON。
 * 分支会话必须有独立的物理文件，否则两条会话共享同一媒体路径后清理彼此会互相污染。
 */
async function clonePartsMedia(partsJson: string | null | undefined): Promise<string> {
  if (!partsJson) return '';
  const parts = parseMessageParts(partsJson);
  if (parts.length === 0) return partsJson;
  const copied = await Promise.all(parts.map(async (p) => {
    if (p.type === 'text') return p;
    try {
      return { ...p, path: await copyFileToAttachments(p.path) };
    } catch (e) {
      logger.warn('attachment', `分支复制 parts 媒体失败: ${p.path}, error=${e}`);
      return p;
    }
  }));
  return JSON.stringify(copied);
}

export const createConversationSlice: ChatSlice = (set, get) => ({
  conversations: [],
  activeConversationId: null,
  hasMoreConversations: true,
  isLoadingMore: false,
  searchResults: null,
  isSearching: false,
  archivedConversations: [],

  async loadConversations() {
    const rows = await daoLoadConversations(PAGE_SIZE);
    set(() => ({ conversations: rows, hasMoreConversations: rows.length >= PAGE_SIZE }));
  },

  async loadMoreConversations() {
    let blocked = false;
    set((s) => {
      if (!s.hasMoreConversations || s.isLoadingMore) { blocked = true; return s; }
      return { isLoadingMore: true };
    });
    if (blocked) return;
    const { conversations } = get();
    const rows = await daoLoadConversations(PAGE_SIZE, conversations.length);
    set((s) => ({
      conversations: [...s.conversations, ...rows],
      hasMoreConversations: rows.length >= PAGE_SIZE,
      isLoadingMore: false,
    }));
  },

  async searchConversations(keyword: string) {
    if (!keyword.trim()) {
      searchVersion++;
      set(() => ({ searchResults: null, isSearching: false }));
      return;
    }
    const v = ++searchVersion;
    set(() => ({ isSearching: true }));
    const rows = await daoSearchConversations(keyword);
    if (v !== searchVersion) return;
    set(() => ({ searchResults: rows, isSearching: false }));
  },

  async setActiveConversation(id) {
    if (!id) {
      set(() => ({ activeConversationId: null, messages: [], editingMessageId: null }));
      useModelStore.setState({ selectedInstructionIds: [] });
      return;
    }

    // 校验会话存在：外部 deep link 可传入任意 id，不校验会导致激活"幽灵会话"，
    // 后续 saveUserMessage 会触发 FK 错误。
    const exists = await conversationExists(id);
    if (!exists) {
      logger.warn('conversation', `尝试激活不存在的会话: id=${id}，回退到空状态`);
      set(() => ({ activeConversationId: null, messages: [], editingMessageId: null }));
      useModelStore.setState({ selectedInstructionIds: [] });
      return;
    }

    const msgs = await getMessages(id);
    // Load attachments for all messages
    const attRows = await getAttachmentsByConversation(id);
    if (attRows.length) {
      const attMap = new Map<string, Attachment[]>();
      for (const row of attRows) {
        const list = attMap.get(row.message_id) ?? [];
        list.push({ id: row.id, type: row.type as 'image' | 'file', name: row.name, path: row.path, preview: getAttachmentUrl(row.path) });
        attMap.set(row.message_id, list);
      }
      for (const msg of msgs) {
        const atts = attMap.get(msg.id);
        if (atts) msg.attachments = atts;
      }
    }
    const conv = get().conversations.find((c) => c.id === id)
      ?? get().archivedConversations.find((c) => c.id === id);

    // Load instruction IDs for this conversation
    let selectedInstructionIds: string[] = [];
    try {
      const { getConversationInstructionIds } = await import('../../lib/instruction');
      selectedInstructionIds = await getConversationInstructionIds(id);
    } catch (e) {
      logger.error('instruction', `加载对话指令关联失败: ${e}`);
    }

    // Load knowledge base IDs for this conversation
    let selectedKnowledgeBaseIds: string[] = [];
    try {
      const { getConversationKnowledgeBases } = await import('../../lib/knowledge-base');
      const kbs = await getConversationKnowledgeBases(id);
      selectedKnowledgeBaseIds = kbs.map((kb) => kb.id);
    } catch (e) {
      logger.error('knowledge-base', `加载对话知识库关联失败: ${e}`);
    }

    set(() => ({
      activeConversationId: id,
      messages: msgs,
      editingMessageId: null,
    }));
    useModelStore.setState({
      comparisonModel: null,
      selectedInstructionIds,
      selectedKnowledgeBaseIds,
      webSearchEnabled: false,
      ...(conv ? { selectedProviderId: conv.provider_id, selectedModelId: conv.model_id } : {}),
    });
  },

  async createConversation() {
    const { selectedProviderId, selectedModelId } = useModelStore.getState();
    const id = crypto.randomUUID();
    const now = nowUnix();
    await insertConversation(id, i18n.t('chat.newConversation'), selectedProviderId, selectedModelId ?? '', now);
    await get().loadConversations();
    logger.info('conversation', `创建对话: id=${id}, provider=${selectedProviderId}, model=${selectedModelId}`);
    return id;
  },

  async deleteConversation(id) {
    logger.info('conversation', `删除对话: id=${id}`);
    await get().stopAnyStreaming(id);

    await cleanupConversationFiles(id);
    await daoDeleteConversation(id);
    const { activeConversationId } = get();
    if (activeConversationId === id) {
      set(() => ({ activeConversationId: null, messages: [], editingMessageId: null }));
    }
    await get().loadConversations();
    await get().loadArchivedConversations();
  },

  async renameConversation(id, title) {
    await daoRenameConversation(id, title);
    const updateTitle = (c: ConversationRow) => c.id === id ? { ...c, title } : c;
    set((s) => ({
      conversations: s.conversations.map(updateTitle),
      archivedConversations: s.archivedConversations.map(updateTitle),
    }));
  },

  newChat() {
    set(() => ({
      activeConversationId: null,
      messages: [],
      editingMessageId: null,
    }));
    useModelStore.setState({
      comparisonModel: null,
      webSearchEnabled: false,
      selectedKnowledgeBaseIds: [],
      selectedInstructionIds: [],
    });
  },

  async pinConversation(id) {
    await toggleConversationPinned(id);
    await get().loadConversations();
  },

  async archiveConversation(id) {
    const newArchived = await toggleConversationArchived(id);
    logger.info('conversation', `${newArchived ? '归档' : '取消归档'}对话: id=${id}`);
    const { activeConversationId } = get();
    if (activeConversationId === id && newArchived) {
      set(() => ({ activeConversationId: null, messages: [], editingMessageId: null }));
    }
    await get().loadConversations();
    await get().loadArchivedConversations();
  },

  async loadArchivedConversations() {
    const rows = await daoLoadArchivedConversations();
    set(() => ({ archivedConversations: rows }));
  },

  async createBranchConversation(messageId: string) {
    const { messages } = get();
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const sourceMsgs = messages.slice(0, msgIndex + 1);
    const newConvId = await get().createConversation();
    logger.info('conversation', `创建分支对话: newConvId=${newConvId}, 源消息数=${sourceMsgs.length}`);

    for (const msg of sourceMsgs) {
      const newMsgId = crypto.randomUUID();
      // parts 里的生成媒体需要拷贝出独立副本，避免分支和原会话共享同一物理文件导致清理互相污染。
      const newParts = await clonePartsMedia(msg.parts);
      await insertBranchMessage(newMsgId, newConvId, msg.role, msg.content, msg.thinking || '', newParts, msg.created_at);
      if (msg.attachments?.length) {
        for (const att of msg.attachments) {
          // Copy physical file so branch has its own independent copy
          let newPath = att.path;
          try {
            newPath = await copyFileToAttachments(att.path);
          } catch (e) {
            logger.warn('attachment', `分支复制附件失败: ${att.path}, error=${e}`);
          }
          await insertAttachment(crypto.randomUUID(), newMsgId, att.type, att.name, newPath, 0, msg.created_at);
        }
      }
    }

    await get().setActiveConversation(newConvId);
  },
});
