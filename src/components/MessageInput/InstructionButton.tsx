import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { Tooltip } from '../ui/Tooltip';
import { listInstructions } from '../../lib/instruction';
import type { Instruction } from '../../lib/instruction';
import { useTranslation } from 'react-i18next';
import { useTauriEvent } from '../../hooks/useTauriEvent';

interface Props {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export default function InstructionButton({ selectedIds, onSelectionChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 跨窗口订阅：设置窗里改 enabled/删除指令，聊天窗按钮要实时刷新。
  const loadAll = useCallback(() => {
    listInstructions().then((all) => {
      setInstructions(all.filter((i) => i.enabled === 1));
      setLoaded(true);
    });
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);
  useTauriEvent('instructions-changed', loadAll);

  // 剔除已禁用/删除的幽灵 id：否则 badge 还显示旧数量，但运行时注入却不包含它们。
  useEffect(() => {
    if (!loaded || selectedIds.length === 0) return;
    const valid = new Set(instructions.map((i) => i.id));
    const filtered = selectedIds.filter((id) => valid.has(id));
    if (filtered.length !== selectedIds.length) onSelectionChange(filtered);
  }, [instructions, loaded, selectedIds, onSelectionChange]);

  const toggle = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((i) => i !== id)
        : [...selectedIds, id],
    );
  };

  const hasSelection = selectedIds.length > 0;

  if (!loaded || (instructions.length === 0 && !hasSelection)) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={t('instruction.tooltip')}>
        <PopoverTrigger asChild>
          <div className="relative">
            <button
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                hasSelection
                  ? 'text-(--color-accent) bg-(--color-accent)/10'
                  : 'text-(--color-label-secondary) hover:bg-(--color-fill)'
              }`}
            >
              <ScrollText className="w-4 h-4" />
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
        {instructions.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-(--color-label-tertiary)">
            {t('instruction.noInstructions')}
          </div>
        ) : (
          instructions.map((instr) => {
            const selected = selectedIds.includes(instr.id);
            return (
              <button
                key={instr.id}
                onClick={() => toggle(instr.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-(--color-label) hover:bg-(--color-fill) transition-colors"
              >
                <span className={`w-4 h-4 flex items-center justify-center rounded border ${
                  selected
                    ? 'bg-(--color-accent) border-(--color-accent) text-white'
                    : 'border-(--color-separator)'
                }`}>
                  {selected && <Check className="w-3 h-3" />}
                </span>
                <span className="truncate">{instr.title}</span>
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}
