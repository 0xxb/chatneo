import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon, Palette, Bot, MessageSquareQuote, ScrollText, Puzzle, Hammer, Cable, SlidersHorizontal, AudioLines, Database, Keyboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppLayout from '../components/AppLayout';

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

export default function Settings() {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const menuItems = useMemo<MenuItem[]>(() => [
    { path: '/general', label: t('settings.general'), icon: SettingsIcon },
    { path: '/appearance', label: t('settings.appearance.title'), icon: Palette },
    { path: '/provider', label: t('settings.providers'), icon: Bot },
    { path: '/prompt', label: t('settings.prompts'), icon: MessageSquareQuote },
    { path: '/instruction', label: t('settings.instructions'), icon: ScrollText },
    { path: '/knowledge', label: t('settings.knowledgeBase'), icon: Database },
    { path: '/plugin', label: t('settings.plugins'), icon: Puzzle },
    { path: '/tool', label: t('settings.tools'), icon: Hammer },
    { path: '/voice', label: t('settings.voice.title'), icon: AudioLines },
    { path: '/mcp', label: 'MCP', icon: Cable },
    { path: '/shortcut', label: t('settings.shortcuts'), icon: Keyboard },
    { path: '/advanced', label: t('settings.advanced'), icon: SlidersHorizontal },
  ], [t]);

  const title = menuItems.find((item) => pathname.startsWith(item.path))?.label ?? t('settings.title');

  return (
    <AppLayout
      defaultWidth={140}
      resizable={false}
      showDivider
      title={title}
      contentBg="var(--color-settings-bg)"
      titleBarClassName="bg-(--color-bg-window)"
      sidebar={
        <nav className="p-1.5 space-y-1 cursor-default">
          {menuItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-2.5 py-1 rounded-md text-[13px] transition-colors cursor-default ${
                  isActive
                    ? 'bg-(--color-accent) text-white'
                    : 'text-(--color-label-secondary) hover:bg-(--color-fill-secondary) hover:text-(--color-label)'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      }
    >
      <div className="h-full cursor-default">
        <Outlet />
      </div>
    </AppLayout>
  );
}
