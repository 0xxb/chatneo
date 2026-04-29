import { useEffect, useRef } from "react";
import AppLayout from "./components/AppLayout";
import ConversationList from "./components/ConversationList";
import SidebarToggle from "./components/TitleBar/SidebarToggle";
import NewChatButton from "./components/TitleBar/NewChatButton";
import ModelSelector from "./components/ModelSelector";
import { PhotoProvider } from "react-photo-view";
import { TooltipProvider } from "./components/ui/Tooltip";
import { Toaster } from "sonner";
import Home from "./pages/Home";
import { useChatStore } from "./store/chat";
import { useModelStore } from "./store/model";
import { useBootStore } from "./store/boot";
import { useModels } from "./hooks/useModels";
import { resolveCapabilities } from "./lib/model-capabilities";
import { initScheduler } from './lib/webdav-scheduler';
import { useShortcuts } from './hooks/useShortcuts';
import { useTauriEvent } from './hooks/useTauriEvent';

function App() {
  const bootStatus = useBootStore((s) => s.status);
  const bootErrors = useBootStore((s) => s.errors);
  const selectedProviderId = useModelStore((s) => s.selectedProviderId);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setModel = useModelStore((s) => s.setModel);
  const comparisonModel = useModelStore((s) => s.comparisonModel);
  const setComparisonModel = useModelStore((s) => s.setComparisonModel);
  const restoreModel = useModelStore((s) => s.restoreModel);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const newChat = useChatStore((s) => s.newChat);
  const setCurrentThinkingCapability = useModelStore((s) => s.setCurrentThinkingCapability);
  const setThinkingLevel = useModelStore((s) => s.setThinkingLevel);
  const setResolvedCapabilities = useModelStore((s) => s.setResolvedCapabilities);
  const { models, loading: modelsLoading } = useModels();

  useShortcuts();

  useEffect(() => {
    initScheduler();
  }, []);

  // 标题更新事件（来自插件等）写回 store
  useTauriEvent<{ id: string; title: string }>('conversation-title-updated', ({ payload }) => {
    useChatStore.setState((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === payload.id ? { ...c, title: payload.title } : c,
      ),
    }));
  });

  useTauriEvent<{
    conversationId?: string;
    input?: string;
    model?: string;
  }>('deep-link-chat', async (event) => {
    const { conversationId, input, model } = event.payload;

    if (conversationId) {
      await useChatStore.getState().setActiveConversation(conversationId);
    } else {
      newChat();
    }

    if (model) {
      const sep = model.indexOf(':');
      if (sep > 0) {
        const pid = Number(model.slice(0, sep));
        const mid = model.slice(sep + 1);
        if (!Number.isNaN(pid) && mid) {
          setModel(pid, mid);
        }
      }
    }

    if (input) {
      useModelStore.getState().setPendingInput(input);
    }
  });

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!modelsLoading) {
      restoreModel(models);
    }
  }, [modelsLoading, models, restoreModel]);

  const modelsRef = useRef(models);
  modelsRef.current = models;

  // Resolve capabilities when model changes — but NOT when models list updates (e.g. toggling favorites)
  useEffect(() => {
    if (!selectedModelId) {
      setCurrentThinkingCapability(null);
      setThinkingLevel('off');
      setResolvedCapabilities({});
      return;
    }
    const selectedModel = modelsRef.current.find(
      (m) => m.modelId === selectedModelId && m.providerId === selectedProviderId,
    );
    const caps = resolveCapabilities(selectedModel?.capabilities, selectedModelId);
    setResolvedCapabilities(caps);
    setCurrentThinkingCapability(caps.thinking ?? null);
    setThinkingLevel(caps.thinking && !caps.thinking.canDisable ? caps.thinking.defaultLevel : 'off');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelId, selectedProviderId, setCurrentThinkingCapability, setThinkingLevel, setResolvedCapabilities]);

  if (bootStatus !== 'ready') {
    return (
      <div className="h-full w-full flex items-center justify-center text-(--color-label-secondary) text-sm select-none">
        {bootStatus === 'error'
          ? `初始化失败：${Object.entries(bootErrors).map(([k, v]) => `${k}: ${v}`).join('；')}`
          : '正在加载…'}
      </div>
    );
  }

  return (
    <PhotoProvider>
      <TooltipProvider delayDuration={300}>
        <AppLayout
          sidebar={<ConversationList />}
          scrollUnderTitleBar
          title={
            <ModelSelector
              providerId={selectedProviderId}
              modelId={selectedModelId}
              onChange={(pid, mid) => setModel(pid, mid)}
              comparisonModel={comparisonModel}
              onComparisonChange={setComparisonModel}
            />
          }
          leading={
            <div className="flex items-center gap-0.5">
              <SidebarToggle />
              <NewChatButton onClick={newChat} />
            </div>
          }
        >
          <Home />
        </AppLayout>
        <Toaster position="top-center" richColors style={{ fontSize: '13px' }} toastOptions={{ style: { padding: '8px 12px', gap: '6px' } }} />
      </TooltipProvider>
    </PhotoProvider>
  );
}

export default App;
