import { useEffect, useSyncExternalStore } from 'react';
import { useChatStore } from '../../store/chat';
import { useModelStore } from '../../store/model';
import { getSettingValue, subscribeSettings } from '../../lib/apply-settings';
import { useTools } from '../../hooks/useTools';

/** Aggregated store selectors for MessageInput, reducing individual useChatStore calls. */
export function useMessageInputState() {
  const editingMessageId = useChatStore((s) => s.editingMessageId);
  const cancelEditMessage = useChatStore((s) => s.cancelEditMessage);
  const pendingInput = useModelStore((s) => s.pendingInput);
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const resolvedCapabilities = useModelStore((s) => s.resolvedCapabilities);

  // Thinking
  const thinkingLevel = useModelStore((s) => s.thinkingLevel);
  const setThinkingLevel = useModelStore((s) => s.setThinkingLevel);
  const thinkingCap = useModelStore((s) => s.currentThinkingCapability);

  // Feature toggles
  const selectedKnowledgeBaseIds = useModelStore((s) => s.selectedKnowledgeBaseIds);
  const setSelectedKnowledgeBaseIds = useModelStore((s) => s.setSelectedKnowledgeBaseIds);
  const selectedInstructionIds = useModelStore((s) => s.selectedInstructionIds);
  const setSelectedInstructionIds = useModelStore((s) => s.setSelectedInstructionIds);
  const webSearchEnabled = useModelStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useModelStore((s) => s.setWebSearchEnabled);

  // Subscribe because the settings cache is populated async by initSettings();
  // a plain useState snapshot would read undefined on first mount.
  const { tools: registeredTools } = useTools();
  const toolsGlobalEnabled = useSyncExternalStore(
    subscribeSettings,
    () => getSettingValue('tools_enabled') === '1',
  );
  const webSearchAvailable = toolsGlobalEnabled &&
    registeredTools.some((t) => t.id === 'web-search' && t.enabled);

  useEffect(() => {
    if (!webSearchAvailable && webSearchEnabled) setWebSearchEnabled(false);
  }, [webSearchAvailable, webSearchEnabled, setWebSearchEnabled]);

  return {
    editingMessageId, cancelEditMessage, pendingInput, hasMessages, resolvedCapabilities,
    thinkingLevel, setThinkingLevel, thinkingCap,
    selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds,
    selectedInstructionIds, setSelectedInstructionIds,
    webSearchEnabled, setWebSearchEnabled, webSearchAvailable,
  };
}
