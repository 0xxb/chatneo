import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import TitleBar from '../TitleBar';

export interface SubMenuItem {
  id: string;
  path: string;
  label: string;
  icon?: ReactNode;
  /** 右键菜单回调 */
  onContextMenu?: (e: React.MouseEvent) => void;
}

export interface SubMenuGroup {
  label?: string;
  items: SubMenuItem[];
}

interface SubLayoutProps {
  /** Flat item list (legacy) */
  items?: SubMenuItem[];
  /** Grouped items with optional section labels */
  groups?: SubMenuGroup[];
  title: string;
  /** Custom content on the right side of the sub title bar */
  titleExtra?: ReactNode;
  children: ReactNode;
  /** Custom content at the top of the sub-nav, before items */
  header?: ReactNode;
  /** Custom content at the bottom of the sub-nav */
  footer?: ReactNode;
  /** Placeholder text shown in nav when items is empty */
  emptyText?: string;
}

function NavItem({ id, path, label, icon, onContextMenu }: SubMenuItem) {
  return (
    <NavLink
      key={id}
      to={path}
      onContextMenu={onContextMenu}
      className={({ isActive }) =>
        `flex items-center gap-2 px-2.5 py-1 rounded-md text-[13px] transition-colors cursor-default ${
          isActive
            ? 'bg-(--color-accent) text-white'
            : 'text-(--color-label-secondary) hover:bg-(--color-fill-secondary) hover:text-(--color-label)'
        }`
      }
    >
      {icon && <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">{icon}</span>}
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function SubLayout({
  items,
  groups,
  title,
  titleExtra,
  children,
  header,
  footer,
  emptyText,
}: SubLayoutProps) {
  // Normalize to groups
  const resolvedGroups: SubMenuGroup[] = groups ?? (items ? [{ items }] : []);
  const totalItems = resolvedGroups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="flex h-full">
      {/* Sub navigation */}
      <div className="w-48 shrink-0 border-r border-(--color-separator) flex flex-col">
        {header && <div className="shrink-0">{header}</div>}
        <nav className="flex-1 min-h-0 overflow-auto p-1.5 space-y-0.5">
          {totalItems === 0 && emptyText ? (
            <div className="h-full flex items-center justify-center text-[12px] text-(--color-label-tertiary)">
              {emptyText}
            </div>
          ) : (
            resolvedGroups.map((group, gi) => (
              <div key={gi} className="space-y-0.5">
                {group.label && (
                  <div className="px-2.5 pt-2 pb-0.5 text-[11px] font-medium text-(--color-label-tertiary) first:pt-0">
                    {group.label}
                  </div>
                )}
                {group.items.map((item) => (
                  <NavItem key={item.id} {...item} />
                ))}
              </div>
            ))
          )}
        </nav>

        {footer && (
          <div className="shrink-0 border-t border-(--color-separator)">
            {footer}
          </div>
        )}
      </div>

      {/* Sub content area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <TitleBar
          title={title}
          size="small"
          showDivider
          extra={titleExtra}
        />
        <div className="flex-1 min-h-0 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
