import { type ReactNode } from 'react';
import { useSidebarStore } from '../../store/sidebar';

type TitleBarSize = 'default' | 'small';

interface TitleBarProps {
  title?: ReactNode;
  size?: TitleBarSize;
  showDivider?: boolean;
  extra?: ReactNode;
}

const sizeConfig = {
  default: { height: 'h-12', text: 'text-sm', draggable: true },
  small: { height: 'h-8', text: 'text-xs', draggable: false },
};

// 88px (leading left) + 58px (buttons) + 8px (gap)
const LEADING_OFFSET = 154;

export default function TitleBar({
  title = 'ChatNeo',
  size = 'default',
  showDivider = false,
  extra,
}: TitleBarProps) {
  const isOpen = useSidebarStore((s) => s.isOpen);
  const { height, text, draggable } = sizeConfig[size];

  return (
    <div
      {...(draggable && { 'data-tauri-drag-region': true })}
      className={`${height} flex items-center justify-between pr-4 select-none shrink-0 transition-[padding-left] duration-200 ease-in-out ${showDivider ? 'border-b border-(--color-separator)' : ''}`}
      style={{ paddingLeft: draggable && !isOpen ? LEADING_OFFSET : 10 }}
    >
      <div className={`${text} font-medium text-(--color-label)`}>
        {title}
      </div>
      {extra && <div className="flex items-center">{extra}</div>}
    </div>
  );
}
