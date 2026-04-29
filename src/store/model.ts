import { create } from 'zustand';
import type { ThinkingCapability, ThinkingLevel, ModelCapabilities } from '../lib/model-capabilities';
import { logger } from '../lib/logger';

export interface ModelState {
  // Model selection
  selectedProviderId: number | null;
  selectedModelId: string | null;
  setModel: (providerId: number, modelId: string) => void;
  restoreModel: (availableModels: { providerId: number; modelId: string }[]) => void;

  // Thinking capabilities
  thinkingLevel: ThinkingLevel;
  currentThinkingCapability: ThinkingCapability | null;
  resolvedCapabilities: ModelCapabilities;
  setThinkingLevel: (level: ThinkingLevel) => void;
  setCurrentThinkingCapability: (cap: ThinkingCapability | null) => void;
  setResolvedCapabilities: (caps: ModelCapabilities) => void;

  // Generation params (null = use global default)
  temperature: number | null;
  maxOutputTokens: number | null;
  topP: number | null;
  topK: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  stopSequences: string[] | null;
  seed: number | null;
  setTemperature: (value: number | null) => void;
  setMaxOutputTokens: (value: number | null) => void;
  setTopP: (value: number | null) => void;
  setTopK: (value: number | null) => void;
  setFrequencyPenalty: (value: number | null) => void;
  setPresencePenalty: (value: number | null) => void;
  setStopSequences: (value: string[] | null) => void;
  setSeed: (value: number | null) => void;
  resetModelParams: () => void;

  // Comparison mode
  comparisonModel: { providerId: number; modelId: string } | null;
  setComparisonModel: (model: { providerId: number; modelId: string } | null) => void;

  // Deep link pending input
  pendingInput: string | null;
  setPendingInput: (input: string | null) => void;

  // Context selection
  selectedKnowledgeBaseIds: string[];
  selectedInstructionIds: string[];
  webSearchEnabled: boolean;
  setSelectedKnowledgeBaseIds: (ids: string[]) => void;
  setSelectedInstructionIds: (ids: string[]) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  selectedProviderId: null,
  selectedModelId: null,
  thinkingLevel: 'off' as ThinkingLevel,
  currentThinkingCapability: null as ThinkingCapability | null,
  resolvedCapabilities: {} as ModelCapabilities,
  temperature: null,
  maxOutputTokens: null,
  topP: null,
  topK: null,
  frequencyPenalty: null,
  presencePenalty: null,
  stopSequences: null,
  seed: null,
  comparisonModel: null,
  pendingInput: null,
  selectedKnowledgeBaseIds: [] as string[],
  selectedInstructionIds: [] as string[],
  webSearchEnabled: false,

  setModel(providerId: number, modelId: string) {
    set(() => ({ selectedProviderId: providerId, selectedModelId: modelId }));
    try {
      localStorage.setItem('chatneo:lastModel', JSON.stringify({ providerId, modelId }));
    } catch { /* ignore */ }
  },

  restoreModel(availableModels: { providerId: number; modelId: string }[]) {
    const { selectedProviderId, selectedModelId } = get();

    if (selectedProviderId !== null && selectedModelId) {
      if (availableModels.some((m) => m.providerId === selectedProviderId && m.modelId === selectedModelId)) {
        return;
      }
    }

    try {
      const saved = localStorage.getItem('chatneo:lastModel');
      if (saved) {
        const { providerId, modelId } = JSON.parse(saved) as { providerId: number; modelId: string };
        if (availableModels.some((m) => m.providerId === providerId && m.modelId === modelId)) {
          set(() => ({ selectedProviderId: providerId, selectedModelId: modelId }));
          return;
        }
      }
    } catch { /* ignore */ }

    if (availableModels.length > 0) {
      const first = availableModels[0];
      set(() => ({ selectedProviderId: first.providerId, selectedModelId: first.modelId }));
    } else {
      set(() => ({ selectedProviderId: null, selectedModelId: null }));
    }
  },

  setThinkingLevel(level: ThinkingLevel) {
    set(() => ({ thinkingLevel: level }));
  },

  setCurrentThinkingCapability(cap: ThinkingCapability | null) {
    set(() => ({ currentThinkingCapability: cap }));
  },

  setResolvedCapabilities(caps: ModelCapabilities) {
    set(() => ({ resolvedCapabilities: caps }));
  },

  setTemperature(value: number | null) {
    set(() => ({ temperature: value }));
  },

  setMaxOutputTokens(value: number | null) {
    set(() => ({ maxOutputTokens: value }));
  },

  setTopP(value: number | null) {
    set(() => ({ topP: value }));
  },

  setTopK(value: number | null) {
    set(() => ({ topK: value }));
  },

  setFrequencyPenalty(value: number | null) {
    set(() => ({ frequencyPenalty: value }));
  },

  setPresencePenalty(value: number | null) {
    set(() => ({ presencePenalty: value }));
  },

  setStopSequences(value: string[] | null) {
    set(() => ({ stopSequences: value }));
  },

  setSeed(value: number | null) {
    set(() => ({ seed: value }));
  },

  setComparisonModel(model) {
    set(() => ({ comparisonModel: model }));
  },

  setPendingInput(input) {
    set(() => ({ pendingInput: input }));
  },

  setSelectedKnowledgeBaseIds(ids) {
    set(() => ({ selectedKnowledgeBaseIds: ids }));
    // Import chat store lazily to avoid circular dependency
    import('./chat').then(({ useChatStore }) => {
      const { activeConversationId } = useChatStore.getState();
      if (activeConversationId) {
        import('../lib/knowledge-base').then(({ setConversationKnowledgeBases }) => {
          setConversationKnowledgeBases(activeConversationId, ids).catch((e) => {
            logger.error('knowledge-base', `知识库关联持久化失败: ${e}`);
          });
        });
      }
    });
  },

  setWebSearchEnabled(enabled) {
    set(() => ({ webSearchEnabled: enabled }));
  },

  setSelectedInstructionIds(ids) {
    set(() => ({ selectedInstructionIds: ids }));
    // Import chat store lazily to avoid circular dependency
    import('./chat').then(({ useChatStore }) => {
      const { activeConversationId } = useChatStore.getState();
      if (activeConversationId) {
        import('../lib/instruction').then(({ setConversationInstructions }) => {
          setConversationInstructions(activeConversationId, ids).catch((e) => {
            logger.error('instruction', `指令关联持久化失败: ${e}`);
          });
        });
      }
    });
  },

  resetModelParams() {
    set(() => ({
      temperature: null,
      maxOutputTokens: null,
      topP: null,
      topK: null,
      frequencyPenalty: null,
      presencePenalty: null,
      stopSequences: null,
      seed: null,
    }));
  },
}));
