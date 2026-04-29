import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useModelStore } from '../model';

// Mock localStorage
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
  clear: vi.fn(() => storage.clear()),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock dynamic imports used by setSelectedKnowledgeBaseIds / setSelectedInstructionIds
vi.mock('../chat', () => ({
  useChatStore: { getState: () => ({ activeConversationId: 'conv1' }) },
}));
vi.mock('../../lib/knowledge-base', () => ({
  setConversationKnowledgeBases: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../lib/instruction', () => ({
  setConversationInstructions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('useModelStore', () => {
  beforeEach(() => {
    storage.clear();
    useModelStore.setState({
      selectedProviderId: null,
      selectedModelId: null,
      thinkingLevel: 'off',
      currentThinkingCapability: null,
      resolvedCapabilities: {},
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
      selectedKnowledgeBaseIds: [],
      selectedInstructionIds: [],
      webSearchEnabled: false,
    });
  });

  describe('setModel', () => {
    it('sets provider and model', () => {
      useModelStore.getState().setModel(1, 'gpt-4');
      const s = useModelStore.getState();
      expect(s.selectedProviderId).toBe(1);
      expect(s.selectedModelId).toBe('gpt-4');
    });

    it('persists to localStorage', () => {
      useModelStore.getState().setModel(2, 'claude-3');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'chatneo:lastModel',
        JSON.stringify({ providerId: 2, modelId: 'claude-3' }),
      );
    });
  });

  describe('restoreModel', () => {
    it('keeps current selection if still available', () => {
      useModelStore.setState({ selectedProviderId: 1, selectedModelId: 'gpt-4' });
      useModelStore.getState().restoreModel([{ providerId: 1, modelId: 'gpt-4' }, { providerId: 2, modelId: 'claude' }]);
      expect(useModelStore.getState().selectedModelId).toBe('gpt-4');
    });

    it('restores from localStorage if current not in available list', () => {
      storage.set('chatneo:lastModel', JSON.stringify({ providerId: 3, modelId: 'gemini' }));
      useModelStore.getState().restoreModel([{ providerId: 3, modelId: 'gemini' }]);
      expect(useModelStore.getState().selectedProviderId).toBe(3);
      expect(useModelStore.getState().selectedModelId).toBe('gemini');
    });

    it('falls back to first available if localStorage model not available', () => {
      storage.set('chatneo:lastModel', JSON.stringify({ providerId: 99, modelId: 'gone' }));
      useModelStore.getState().restoreModel([{ providerId: 1, modelId: 'fallback' }]);
      expect(useModelStore.getState().selectedModelId).toBe('fallback');
    });

    it('clears selection if no models available', () => {
      useModelStore.setState({ selectedProviderId: 1, selectedModelId: 'old' });
      useModelStore.getState().restoreModel([]);
      expect(useModelStore.getState().selectedProviderId).toBeNull();
      expect(useModelStore.getState().selectedModelId).toBeNull();
    });

    it('handles malformed localStorage gracefully', () => {
      storage.set('chatneo:lastModel', 'not-json');
      useModelStore.getState().restoreModel([{ providerId: 1, modelId: 'x' }]);
      expect(useModelStore.getState().selectedModelId).toBe('x');
    });
  });

  describe('thinking capabilities', () => {
    it('setThinkingLevel', () => {
      useModelStore.getState().setThinkingLevel('high');
      expect(useModelStore.getState().thinkingLevel).toBe('high');
    });

    it('setCurrentThinkingCapability', () => {
      const cap: import('../../lib/model-capabilities').ThinkingCapability = { levels: ['off', 'low', 'medium', 'high'], defaultLevel: 'medium', canDisable: true };
      useModelStore.getState().setCurrentThinkingCapability(cap);
      expect(useModelStore.getState().currentThinkingCapability).toEqual(cap);
    });

    it('setResolvedCapabilities', () => {
      const caps: import('../../lib/model-capabilities').ModelCapabilities = { thinking: { levels: ['off', 'high'], defaultLevel: 'high', canDisable: true } };
      useModelStore.getState().setResolvedCapabilities(caps);
      expect(useModelStore.getState().resolvedCapabilities).toEqual(caps);
    });
  });

  describe('generation params', () => {
    it('sets individual params', () => {
      const s = useModelStore.getState();
      s.setTemperature(0.7);
      s.setMaxOutputTokens(2048);
      s.setTopP(0.9);
      s.setTopK(40);
      s.setFrequencyPenalty(0.5);
      s.setPresencePenalty(0.3);
      s.setStopSequences(['###']);
      s.setSeed(42);

      const state = useModelStore.getState();
      expect(state.temperature).toBe(0.7);
      expect(state.maxOutputTokens).toBe(2048);
      expect(state.topP).toBe(0.9);
      expect(state.topK).toBe(40);
      expect(state.frequencyPenalty).toBe(0.5);
      expect(state.presencePenalty).toBe(0.3);
      expect(state.stopSequences).toEqual(['###']);
      expect(state.seed).toBe(42);
    });

    it('resetModelParams clears all params', () => {
      useModelStore.getState().setTemperature(0.5);
      useModelStore.getState().setMaxOutputTokens(1000);
      useModelStore.getState().setSeed(123);

      useModelStore.getState().resetModelParams();
      const state = useModelStore.getState();
      expect(state.temperature).toBeNull();
      expect(state.maxOutputTokens).toBeNull();
      expect(state.seed).toBeNull();
      expect(state.topP).toBeNull();
      expect(state.topK).toBeNull();
      expect(state.frequencyPenalty).toBeNull();
      expect(state.presencePenalty).toBeNull();
      expect(state.stopSequences).toBeNull();
    });
  });

  describe('comparison mode', () => {
    it('sets and clears comparison model', () => {
      useModelStore.getState().setComparisonModel({ providerId: 2, modelId: 'claude-3' });
      expect(useModelStore.getState().comparisonModel).toEqual({ providerId: 2, modelId: 'claude-3' });

      useModelStore.getState().setComparisonModel(null);
      expect(useModelStore.getState().comparisonModel).toBeNull();
    });
  });

  describe('pendingInput', () => {
    it('sets and clears pending input', () => {
      useModelStore.getState().setPendingInput('hello');
      expect(useModelStore.getState().pendingInput).toBe('hello');

      useModelStore.getState().setPendingInput(null);
      expect(useModelStore.getState().pendingInput).toBeNull();
    });
  });

  describe('context selection', () => {
    it('setSelectedKnowledgeBaseIds updates state', () => {
      useModelStore.getState().setSelectedKnowledgeBaseIds(['kb1', 'kb2']);
      expect(useModelStore.getState().selectedKnowledgeBaseIds).toEqual(['kb1', 'kb2']);
    });

    it('setSelectedInstructionIds updates state', () => {
      useModelStore.getState().setSelectedInstructionIds(['ins1']);
      expect(useModelStore.getState().selectedInstructionIds).toEqual(['ins1']);
    });

    it('setWebSearchEnabled toggles', () => {
      useModelStore.getState().setWebSearchEnabled(true);
      expect(useModelStore.getState().webSearchEnabled).toBe(true);

      useModelStore.getState().setWebSearchEnabled(false);
      expect(useModelStore.getState().webSearchEnabled).toBe(false);
    });
  });
});
