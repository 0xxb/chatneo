import { useState, useEffect, useCallback } from 'react';
import { emit } from '@tauri-apps/api/event';
import { listPrompts, insertPrompt, updatePromptField, deletePrompt as daoDeletePrompt } from '../lib/dao/prompt-dao';
import type { PromptDbRow } from '../lib/dao/prompt-dao';
import { safeJsonParse, nowUnix } from '../lib/utils';
import { useTauriEvent } from './useTauriEvent';

export type PromptVariableType = 'input' | 'textarea' | 'select' | 'toggle';

export const DEFAULT_TOGGLE_OPTIONS = ['是', '否'] as const;

export interface PromptVariable {
  name: string;
  type: PromptVariableType;
  default?: string;
  options?: string[];
}

export type PromptCategoryKey = 'translation' | 'writing' | 'development' | 'productivity' | 'learning' | 'lifestyle' | 'professional';
export type PromptCategory = PromptCategoryKey | '';

export const PROMPT_CATEGORIES: PromptCategoryKey[] = ['translation', 'writing', 'development', 'productivity', 'learning', 'lifestyle', 'professional'];

export const CATEGORY_I18N: Record<PromptCategoryKey, string> = {
  translation: 'settings.prompt.categoryTranslation',
  writing: 'settings.prompt.categoryWriting',
  development: 'settings.prompt.categoryDevelopment',
  productivity: 'settings.prompt.categoryProductivity',
  learning: 'settings.prompt.categoryLearning',
  lifestyle: 'settings.prompt.categoryLifestyle',
  professional: 'settings.prompt.categoryProfessional',
};

export interface PromptRow {
  id: string;
  title: string;
  content: string;
  variables: PromptVariable[];
  category: PromptCategory;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

function parseRow(row: PromptDbRow): PromptRow {
  return { ...row, variables: safeJsonParse<PromptVariable[]>(row.variables, []), category: row.category as PromptCategory };
}

export function usePrompts() {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const rows = await listPrompts();
    const parsed = rows.map(parseRow);
    setPrompts(parsed);
    return parsed;
  }, []);

  useEffect(() => {
    let mounted = true;
    reload().then(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [reload]);

  useTauriEvent('prompts-changed', () => { reload(); });

  const addPrompt = useCallback(async (title: string, category: PromptCategory = '') => {
    const id = crypto.randomUUID();
    await insertPrompt(id, title, category);
    await reload();
    emit('prompts-changed');
    return id;
  }, [reload]);

  const updatePrompt = useCallback(async (id: string, field: 'title' | 'content' | 'variables' | 'category', value: string) => {
    const now = nowUnix();
    await updatePromptField(id, field, value);
    if (field === 'variables') {
      const variables = safeJsonParse<PromptVariable[]>(value, []);
      setPrompts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, variables, updated_at: now } : p)),
      );
    } else {
      setPrompts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: value, updated_at: now } : p)),
      );
    }
    emit('prompts-changed');
  }, []);

  const deletePrompt = useCallback(async (id: string) => {
    await daoDeletePrompt(id);
    const rows = await reload();
    emit('prompts-changed');
    return rows;
  }, [reload]);

  return { prompts, loading, addPrompt, updatePrompt, deletePrompt };
}
