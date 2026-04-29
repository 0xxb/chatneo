import { useEffect, useCallback, useState, useMemo } from 'react';
import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ask } from '@tauri-apps/plugin-dialog';
import SubLayout from '../../components/Settings/SubLayout';
import SubNavActions from '../../components/Settings/SubNavActions';
import { usePrompts, PROMPT_CATEGORIES, CATEGORY_I18N } from '../../hooks/usePrompts';
import { useContextMenu } from '../../hooks/useContextMenu';
import type { PromptRow, PromptCategory } from '../../hooks/usePrompts';
import type { SubMenuGroup, SubMenuItem } from '../../components/Settings/SubLayout';

export default function PromptSettings() {
  const { t } = useTranslation();
  const { promptId } = useParams<{ promptId: string }>();
  const navigate = useNavigate();
  const { prompts, loading, addPrompt, deletePrompt, updatePrompt } = usePrompts();
  const [activeCategory, setActiveCategory] = useState<PromptCategory | 'all'>('all');

  const deleteById = useCallback(async (id: string) => {
    const target = prompts.find((p) => p.id === id);
    if (!target) return;
    const confirmed = await ask(t('settings.prompt.deleteConfirm', { name: target.title }), {
      title: t('settings.prompt.deleteTitle'),
      kind: 'warning',
      okLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    const remaining = await deletePrompt(id);
    navigate(
      remaining.length > 0 ? `/prompt/${remaining[0].id}` : '/prompt',
      { replace: true },
    );
  }, [prompts, deletePrompt, navigate]);

  const showItemMenu = useContextMenu<string>(
    [{ type: 'item', id: 'delete', text: t('common.delete') }],
    (_action, id) => deleteById(id),
  );

  const groups = useMemo((): SubMenuGroup[] => {
    const toMenuItem = (p: PromptRow): SubMenuItem => ({
      id: p.id,
      path: `/prompt/${p.id}`,
      label: p.title,
      onContextMenu: (e: React.MouseEvent) => showItemMenu(e, p.id),
    });

    if (activeCategory !== 'all') {
      const filtered = prompts.filter((p) =>
        activeCategory === '' ? !p.category : p.category === activeCategory,
      );
      return [{ items: filtered.map(toMenuItem) }];
    }

    // Single-pass grouping
    const grouped = new Map<string, PromptRow[]>();
    for (const p of prompts) {
      const key = p.category || '';
      const arr = grouped.get(key);
      if (arr) arr.push(p);
      else grouped.set(key, [p]);
    }

    const result: SubMenuGroup[] = [];
    for (const cat of PROMPT_CATEGORIES) {
      const catPrompts = grouped.get(cat);
      if (!catPrompts) continue;
      result.push({ label: t(CATEGORY_I18N[cat]), items: catPrompts.map(toMenuItem) });
    }
    const uncategorized = grouped.get('');
    if (uncategorized) {
      result.push({ label: t('settings.prompt.uncategorized'), items: uncategorized.map(toMenuItem) });
    }
    return result;
  }, [prompts, activeCategory, t, showItemMenu]);

  useEffect(() => {
    if (!loading && !promptId && prompts.length > 0) {
      navigate(`/prompt/${prompts[0].id}`, { replace: true });
    }
  }, [promptId, loading, prompts, navigate]);

  const handleAdd = useCallback(async () => {
    const category = activeCategory === 'all' ? '' : activeCategory;
    const id = await addPrompt(t('settings.prompt.new'), category as PromptCategory);
    navigate(`/prompt/${id}`);
  }, [addPrompt, navigate, prompts.length, activeCategory]);

  const handleDelete = useCallback(async () => {
    if (promptId) deleteById(promptId);
  }, [promptId, deleteById]);

  const title = prompts.find((p) => p.id === promptId)?.title ?? t('settings.prompt.title');

  return (
    <SubLayout
      groups={groups}
      title={title}
      emptyText={t('settings.prompt.empty')}
      header={
        <div className="px-1.5 pt-1.5 pb-0.5">
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value as PromptCategory | 'all')}
            className="w-full rounded-md border border-(--color-separator) bg-(--color-bg-control) px-2 py-1 text-[12px] text-(--color-label) focus:outline-none focus:border-(--color-accent)"
          >
            <option value="all">{t('settings.prompt.allCategories')}</option>
            {PROMPT_CATEGORIES.map((cat) =>
              prompts.some((p) => p.category === cat) && (
                <option key={cat} value={cat}>{t(CATEGORY_I18N[cat])}</option>
              ),
            )}
            {prompts.some((p) => !p.category) && (
              <option value="">{t('settings.prompt.uncategorized')}</option>
            )}
          </select>
        </div>
      }
      footer={<SubNavActions onAdd={handleAdd} onDelete={handleDelete} deleteDisabled={!promptId} />}
    >
      <Outlet context={{ prompts, updatePrompt } satisfies OutletContextType} />
    </SubLayout>
  );
}

export interface OutletContextType {
  prompts: PromptRow[];
  updatePrompt: (id: string, field: 'title' | 'content' | 'variables' | 'category', value: string) => Promise<void>;
}
