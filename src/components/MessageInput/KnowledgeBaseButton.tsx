import { useState, useEffect, useCallback } from 'react';
import { Database, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { Tooltip } from '../ui/Tooltip';
import { listKnowledgeBases } from '../../lib/knowledge-base';
import type { KnowledgeBase } from '../../lib/knowledge-base';
import { useTauriEvent } from '../../hooks/useTauriEvent';

interface Props {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export default function KnowledgeBaseButton({ selectedIds, onSelectionChange }: Props) {
  const [open, setOpen] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 跨窗口订阅：设置窗里新增/删除/改名知识库，聊天窗按钮要实时显隐与更新。
  const reload = useCallback(() => {
    listKnowledgeBases().then((kbs) => {
      setKnowledgeBases(kbs);
      setLoaded(true);
    });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useTauriEvent('knowledge-bases-changed', reload);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
  };

  // 剔除已删除的幽灵 id：否则 badge 还显示旧数量，但运行时检索却跳过它们。
  useEffect(() => {
    if (!loaded || selectedIds.length === 0) return;
    const valid = new Set(knowledgeBases.map((kb) => kb.id));
    const filtered = selectedIds.filter((id) => valid.has(id));
    if (filtered.length !== selectedIds.length) onSelectionChange(filtered);
  }, [knowledgeBases, loaded, selectedIds, onSelectionChange]);

  const hasSelection = selectedIds.length > 0;

  if (!loaded || (knowledgeBases.length === 0 && !hasSelection)) return null;

  const toggle = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((i) => i !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip content="知识库">
        <PopoverTrigger asChild>
          <div className="relative">
            <button
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                hasSelection
                  ? 'text-(--color-accent) bg-(--color-accent)/10'
                  : 'text-(--color-label-secondary) hover:bg-(--color-fill)'
              }`}
            >
              <Database className="w-4 h-4" />
            </button>
            {hasSelection && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-(--color-accent) text-white text-[9px] flex items-center justify-center pointer-events-none">
                {selectedIds.length}
              </span>
            )}
          </div>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" className="w-56 p-1 max-h-64 overflow-y-auto">
        {knowledgeBases.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-(--color-label-tertiary)">
            暂无知识库，请在设置中创建
          </div>
        ) : (
          knowledgeBases.map((kb) => {
            const selected = selectedIds.includes(kb.id);
            return (
              <button
                key={kb.id}
                onClick={() => toggle(kb.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-(--color-label) hover:bg-(--color-fill) transition-colors"
              >
                <span className={`w-4 h-4 flex items-center justify-center rounded border ${
                  selected
                    ? 'bg-(--color-accent) border-(--color-accent) text-white'
                    : 'border-(--color-separator)'
                }`}>
                  {selected && <Check className="w-3 h-3" />}
                </span>
                <span className="truncate">{kb.name}</span>
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}
