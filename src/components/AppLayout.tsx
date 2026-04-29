import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import TitleBar from './TitleBar';
import { useSidebarStore } from '../store/sidebar';
import { cn } from '../lib/utils';

interface AppLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  title?: ReactNode;
  leading?: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  showDivider?: boolean;
  contentBg?: string;
  titleBarClassName?: string;
  /** 允许内容滚动到 titlebar 下方，titlebar 显示半透明毛玻璃效果 */
  scrollUnderTitleBar?: boolean;
}

export default function AppLayout({
  sidebar,
  children,
  title,
  leading,
  defaultWidth = 200,
  minWidth = 180,
  maxWidth = 400,
  resizable = true,
  showDivider = false,
  contentBg = 'var(--color-bg-window)',
  titleBarClassName,
  scrollUnderTitleBar = false,
}: AppLayoutProps) {
  const isOpen = useSidebarStore((s) => s.isOpen);
  const [width, setWidth] = useState(defaultWidth);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(defaultWidth);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
  }, [width]);

  const handleMouseDown = useCallback(() => {
    if (!resizable) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
        if (newWidth !== widthRef.current) {
          widthRef.current = newWidth;
          if (sidebarRef.current) {
            sidebarRef.current.style.width = `${newWidth}px`;
            const parent = sidebarRef.current.parentElement;
            if (parent && isOpen) {
              parent.style.marginLeft = '0px';
            } else if (parent) {
              parent.style.marginLeft = `-${newWidth}px`;
            }
          }
          document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        }
      });
    };

    const handleMouseUp = () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.classList.remove('is-resizing');
      setWidth(widthRef.current);
    };

    document.body.style.cursor = 'col-resize';
    document.body.classList.add('is-resizing');
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [resizable, minWidth, maxWidth, isOpen]);

  return (
    <div className="app-bg-container flex h-screen overflow-hidden relative">
      {/* leading 按钮固定在左上角红绿灯右侧，不随 sidebar 开合移动 */}
      {leading && (
        <div className="absolute top-0 left-[88px] h-12 flex items-center z-30">
          {leading}
        </div>
      )}

      {/* Sidebar */}
      <div
        className="shrink-0 relative z-20 transition-[margin-left] duration-200 ease-in-out will-change-[margin-left]"
        style={{ marginLeft: isOpen ? 0 : `-${width}px` }}
      >
        <div
          ref={sidebarRef}
          className="app-sidebar border-r border-(--color-separator) flex flex-col relative h-full"
          style={{ width: `${width}px` }}
        >
          <div data-tauri-drag-region className="h-12 shrink-0" />
          <div className="flex-1 min-h-0">{sidebar}</div>
          {resizable && (
            <div
              className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-(--color-accent) transition-colors"
              onMouseDown={handleMouseDown}
            />
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="app-main flex-1 min-w-0 relative z-10" style={{ background: contentBg }}>
        <div
          className={cn('titlebar-gradient absolute inset-x-0 top-0 z-20 pointer-events-none h-12', titleBarClassName)}
          style={scrollUnderTitleBar ? {
            background: 'linear-gradient(to bottom, var(--color-bg-window) 30%, transparent)',
          } : undefined}
        >
          <div className="pointer-events-auto">
            <TitleBar title={title} showDivider={showDivider} />
          </div>
        </div>
        <div className={`absolute inset-0 ${scrollUnderTitleBar ? 'overflow-hidden' : 'overflow-auto pt-12'}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
