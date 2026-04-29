import { useState, useCallback, useEffect } from 'react';
import type { PromptRow } from '../../hooks/usePrompts';

/**
 * 管理 prompt 选择、变量填充、验证状态。
 * prompts 在 useInputPickers 返回后传入，用于派生 selectedPrompt。
 */
export function usePromptState(prompts: PromptRow[]) {
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [showVariableErrors, setShowVariableErrors] = useState(false);

  const selectedPrompt = selectedPromptId
    ? prompts.find((p) => p.id === selectedPromptId) ?? null
    : null;

  useEffect(() => {
    if (selectedPromptId && !selectedPrompt) {
      setSelectedPromptId(null);
      setVariableValues({});
      setShowVariableErrors(false);
    }
  }, [selectedPromptId, selectedPrompt]);

  const applyPrompt = useCallback((prompt: PromptRow) => {
    setSelectedPromptId(prompt.id);
    const defaults: Record<string, string> = {};
    for (const v of prompt.variables) {
      if (v.default) defaults[v.name] = v.default;
    }
    setVariableValues(defaults);
  }, []);

  const clearPrompt = useCallback(() => {
    setSelectedPromptId(null);
    setVariableValues({});
    setShowVariableErrors(false);
  }, []);

  const handleVariableChange = useCallback((name: string, value: string) => {
    setVariableValues((prev) => ({ ...prev, [name]: value }));
    setShowVariableErrors(false);
  }, []);

  return {
    selectedPrompt,
    variableValues,
    showVariableErrors,
    setShowVariableErrors,
    applyPrompt,
    clearPrompt,
    handleVariableChange,
  };
}
