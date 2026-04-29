import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, X } from 'lucide-react';

export interface Tab {
  key: string;
  label: string;
}

export interface SearchableSelectProps {
  /** 触发按钮显示的文本 */
  displayValue: string;
  /** 触发按钮文本后的额外内容 */
  displayTrailing?: ReactNode;
  /** 搜索框占位符 */
  placeholder?: string;
  /** Tab 列表，不传则不显示 tab */
  tabs?: Tab[];
  /** 当前激活的 tab key */
  activeTab?: string;
  /** Tab 切换回调 */
  onTabChange?: (key: string) => void;
  /** 面板宽度 class，默认 w-80 */
  width?: string;
  /** 搜索词变化回调 */
  onSearchChange?: (query: string) => void;
  /** 列表内容渲染 */
  children: (props: { search: string; close: () => void }) => ReactNode;
}

export function SearchableSelect({
  displayValue,
  displayTrailing,
  placeholder,
  tabs,
  activeTab,
  onTabChange,
  width = 'w-80',
  onSearchChange,
  children,
}: SearchableSelectProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('common.search');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
      setSearch('');
    }
  }, [open]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    onSearchChange?.(value);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium text-(--color-label) hover:bg-(--color-fill-secondary) transition-colors cursor-default"
      >
        {displayValue}
        {displayTrailing}
        <ChevronDown
          size={14}
          className={`text-(--color-label-tertiary) transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className={`select-popover absolute top-full left-0 mt-1 ${width} rounded-xl bg-(--color-bg-popover) backdrop-blur-xl shadow-(--shadow-popover) ring-1 ring-(--color-separator) z-50 animate-in fade-in-0 zoom-in-95 origin-top-left`}>
          <div className="flex items-center gap-1.5 p-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 h-8 rounded-lg bg-(--color-fill) text-(--color-label-secondary)">
              <Search size={14} className="shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={resolvedPlaceholder}
                className="flex-1 min-w-0 bg-transparent text-sm text-(--color-label) placeholder:text-(--color-label-tertiary) outline-none"
              />
              {search && (
                <button onClick={() => handleSearchChange('')} className="shrink-0">
                  <X size={12} />
                </button>
              )}
            </div>

            {tabs && tabs.length > 0 && (
              <div className="flex gap-0.5 shrink-0">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => onTabChange?.(t.key)}
                    className={`px-2 h-8 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      activeTab === t.key
                        ? 'bg-(--color-fill-secondary) text-(--color-label)'
                        : 'text-(--color-label-secondary) hover:text-(--color-label)'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto px-1.5 pb-1.5">
            {children({ search, close: () => setOpen(false) })}
          </div>
        </div>
      )}
    </div>
  );
}

/** 分组标题 */
export function SelectGroup({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-(--color-label-tertiary)">
        {icon}
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

/** 选项行 */
export function SelectOption({
  selected,
  onClick,
  children,
  trailing,
}: {
  selected?: boolean;
  onClick: (e: React.MouseEvent) => void;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors group ${
        selected
          ? 'bg-(--color-accent) text-white'
          : 'hover:bg-(--color-fill-secondary) text-(--color-label)'
      }`}
    >
      <div className="flex-1 min-w-0 text-sm truncate">{children}</div>
      {trailing}
    </button>
  );
}

/** 空状态 */
export function SelectEmpty({ text }: { text?: string }) {
  const { t } = useTranslation();
  return (
    <div className="py-6 text-center text-xs text-(--color-label-tertiary)">
      {text ?? t('common.noMatch')}
    </div>
  );
}