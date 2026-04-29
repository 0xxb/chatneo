import { useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useDropDirection } from '../../hooks/useDropDirection';

/** A generic slash command item. Different sources (prompts, future commands) provide these. */
export interface SlashCommand {
  id: string;
  title: string;
  icon: ReactNode;
  /** Category label shown on the right side, e.g. "提示词", "命令" */
  category: string;
  /** Arbitrary data carried through to the onSelect callback. */
  data: unknown;
}

interface SlashCommandPickerProps {
  commands: SlashCommand[];
  visible: boolean;
  filter: string;
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
}

export default function SlashCommandPicker({ commands, visible, filter, activeIndex, onSelect }: SlashCommandPickerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const { containerRef, dropDown } = useDropDirection(visible);

  const filtered = filterCommands(commands, filter);

  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={`absolute left-0 right-0 z-10 ${dropDown ? 'top-full mt-1' : 'bottom-full mb-1'}`}
    >
      <div className="chat-popover rounded-lg border border-(--color-separator) bg-(--color-bg-popover) backdrop-blur-xl overflow-hidden">
        <div ref={listRef} className="max-h-48 overflow-auto p-1 space-y-0.5">
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(cmd);
              }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] transition-colors ${
                i === activeIndex
                  ? 'bg-(--color-accent) text-white'
                  : 'text-(--color-label) hover:bg-(--color-fill-secondary)'
              }`}
            >
              <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center opacity-60">{cmd.icon}</span>
              <span className="truncate flex-1">{cmd.title}</span>
              <span className={`text-[11px] shrink-0 ${
                i === activeIndex ? 'text-white/60' : 'text-(--color-label-tertiary)'
              }`}>{cmd.category}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Filter commands by keyword matching title or category. */
export function filterCommands(commands: SlashCommand[], filter: string): SlashCommand[] {
  const keyword = filter.toLowerCase();
  return keyword
    ? commands.filter((c) => c.title.toLowerCase().includes(keyword) || c.category.toLowerCase().includes(keyword))
    : commands;
}
