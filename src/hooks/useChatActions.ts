import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ask } from '@tauri-apps/plugin-dialog';
import { useChatStore } from '../store/chat';
import { useModelStore } from '../store/model';
import type { MessagePayload, Attachment } from '../components/MessageInput/types';
import { updateConversationModel, updateConversationModelAndTimestamp } from '../lib/dao/conversation-dao';
import { insertMessage } from '../lib/dao/message-dao';
import { nowUnix } from '../lib/utils';
import { extractSearchResults } from '../lib/search-utils.ts';
import { requestReply, saveUserMessage } from '../lib/chat-orchestrator';
import { toast } from 'sonner';
import { logger } from '../lib/logger';

export function useChatActions() {
  const { t } = useTranslation();

  const handleStop = useCallback(() => {
    const { activeConversationId } = useChatStore.getState();
    if (!activeConversationId) return;
    useChatStore.getState().stopAnyStreaming(activeConversationId);
  }, []);

  const handleAdopt = useCallback(async (index: 0 | 1) => {
    const state = useChatStore.getState();
    const { activeConversationId } = state;
    const { comparisonModel, selectedProviderId, selectedModelId } = useModelStore.getState();
    if (!activeConversationId || !selectedProviderId || !selectedModelId) return;

    const comparisonEntry = state.streamingMap.get(activeConversationId);
    if (!comparisonEntry || !('type' in comparisonEntry) || comparisonEntry.type !== 'comparison') return;
    if (!comparisonModel) return;

    const models = [
      { providerId: selectedProviderId, modelId: selectedModelId },
      comparisonModel,
    ];
    const adoptedModel = models[index];
    const modelKey = `${adoptedModel.providerId}:${adoptedModel.modelId}`;
    const stream = comparisonEntry.streams.get(modelKey);
    if (!stream) return;

    const now = nowUnix();
    const partsJson = stream.toolCalls.length > 0 ? JSON.stringify(stream.toolCalls) : '';
    const ragJson = stream.ragResultsJson || '';
    const wsResults = stream.toolCalls.length > 0 ? extractSearchResults(stream.toolCalls) : [];
    const searchResultsJson = wsResults.length > 0 ? JSON.stringify(wsResults) : '';
    await insertMessage({
      id: stream.messageId,
      conversationId: activeConversationId,
      role: 'assistant',
      content: stream.content,
      thinking: stream.thinking || '',
      parts: partsJson,
      ragResults: ragJson,
      searchResults: searchResultsJson,
      createdAt: now,
    });
    await updateConversationModelAndTimestamp(activeConversationId, adoptedModel.providerId, adoptedModel.modelId, now);

    const assistantMsg = {
      id: stream.messageId,
      conversation_id: activeConversationId,
      role: 'assistant' as const,
      content: stream.content,
      thinking: stream.thinking || '',
      parts: partsJson,
      token_count: null,
      rag_results: ragJson,
      search_results: searchResultsJson,
      created_at: now,
    };

    useChatStore.getState().setComparisonStreaming(activeConversationId, null);
    useChatStore.setState((s) => ({ messages: [...s.messages, assistantMsg] }));
    useModelStore.getState().setModel(adoptedModel.providerId, adoptedModel.modelId);
    useModelStore.getState().setComparisonModel(null);
    await useChatStore.getState().loadConversations();
  }, []);

  const handleClearMessages = useCallback(async () => {
    const confirmed = await ask(t('chat.clearConfirm'), {
      title: t('chat.clearTitle'),
      kind: 'warning',
      okLabel: t('chat.clear'),
      cancelLabel: t('common.cancel'),
    });
    if (confirmed) {
      await useChatStore.getState().clearMessages();
    }
  }, [t]);

  const handleSend = useCallback(async (payload: MessagePayload) => {
    if (!payload.text.trim() && payload.attachments.length === 0) return;

    const state = useChatStore.getState();
    const mState = useModelStore.getState();
    if (state.activeConversationId && state.streamingMap.has(state.activeConversationId)) return;
    const hasModel = mState.selectedProviderId !== null && !!mState.selectedModelId;

    if (!hasModel) {
      toast.error(t('chat.noModelAvailable'));
      return;
    }

    let convId = state.activeConversationId;
    const isNewConversation = !convId;
    if (!convId) {
      convId = await useChatStore.getState().createConversation();
      useChatStore.setState({ activeConversationId: convId });
    }

    const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
    if (conv && (conv.provider_id !== mState.selectedProviderId || conv.model_id !== mState.selectedModelId)) {
      await updateConversationModel(convId, mState.selectedProviderId, mState.selectedModelId!);
      useChatStore.setState((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, provider_id: mState.selectedProviderId, model_id: mState.selectedModelId! } : c,
        ),
      }));
    }

    if (isNewConversation) {
      const tasks: Promise<unknown>[] = [];
      if (mState.selectedKnowledgeBaseIds.length > 0) {
        tasks.push(import('../lib/knowledge-base')
          .then(({ setConversationKnowledgeBases }) => setConversationKnowledgeBases(convId, mState.selectedKnowledgeBaseIds))
          .catch((e) => logger.error('knowledge-base', `新会话知识库关联持久化失败: ${e}`)));
      }
      if (mState.selectedInstructionIds.length > 0) {
        tasks.push(import('../lib/instruction')
          .then(({ setConversationInstructions }) => setConversationInstructions(convId, mState.selectedInstructionIds))
          .catch((e) => logger.error('instruction', `新会话指令关联持久化失败: ${e}`)));
      }
      if (tasks.length > 0) await Promise.all(tasks);
    }

    await saveUserMessage(convId, payload.text, payload.attachments);
    await requestReply(convId);
  }, [t]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    const state = useChatStore.getState();
    if (!state.activeConversationId) return;
    const convId = state.activeConversationId;
    logger.info('message', `重新生成回复: convId=${convId}, fromMessageId=${messageId}`);
    await state.stopAnyStreaming(convId);
    await useChatStore.getState().deleteMessagesFrom(messageId);
    await requestReply(convId);
  }, []);

  // Listen for shortcut-regenerate event
  useEffect(() => {
    function onShortcutRegenerate() {
      const state = useChatStore.getState();
      const msgs = state.messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          handleRegenerate(msgs[i].id);
          break;
        }
      }
    }
    window.addEventListener('shortcut-regenerate', onShortcutRegenerate);
    return () => window.removeEventListener('shortcut-regenerate', onShortcutRegenerate);
  }, [handleRegenerate]);

  const handleBranchConversation = useCallback((messageId: string) => {
    useChatStore.getState().createBranchConversation(messageId);
    toast.success(t('chat.branchCreated'));
  }, [t]);

  const handleDeleteMessage = useCallback((messageId: string) => {
    useChatStore.getState().deleteSingleMessage(messageId);
  }, []);

  const handleEditMessage = useCallback(async (messageId: string, newText: string, attachments: Attachment[]) => {
    const state = useChatStore.getState();
    if (!state.activeConversationId) return;
    const convId = state.activeConversationId;
    logger.info('message', `编辑消息: convId=${convId}, msgId=${messageId}, 新内容长度=${newText.length}`);
    await state.stopAnyStreaming(convId);
    await useChatStore.getState().deleteMessagesFrom(messageId);
    useChatStore.setState({ editingMessageId: null });
    await saveUserMessage(convId, newText, attachments);
    await requestReply(convId);
  }, []);

  return {
    handleStop,
    handleAdopt,
    handleClearMessages,
    handleSend,
    handleRegenerate,
    handleBranchConversation,
    handleDeleteMessage,
    handleEditMessage,
  };
}
