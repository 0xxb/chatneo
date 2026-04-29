import { useEffect } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Info, FileText, SlidersHorizontal, ScrollText, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SubLayout from '../../components/Settings/SubLayout';
import type { SubMenuItem } from '../../components/Settings/SubLayout';

export default function AdvancedSettings() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const items: SubMenuItem[] = [
    { id: 'params', path: '/advanced/params', label: t('settings.advancedNav.modelParams'), icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    { id: 'data', path: '/advanced/data', label: t('settings.advancedNav.data'), icon: <Database className="w-3.5 h-3.5" /> },
    { id: 'log', path: '/advanced/log', label: t('settings.advancedNav.logs'), icon: <ScrollText className="w-3.5 h-3.5" /> },
    { id: 'changelog', path: '/advanced/changelog', label: t('settings.advancedNav.changelog'), icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'info', path: '/advanced/info', label: t('settings.advancedNav.about'), icon: <Info className="w-3.5 h-3.5" /> },
  ];

  useEffect(() => {
    if (pathname === '/advanced') navigate(items[0].path, { replace: true });
  }, [pathname, navigate]);

  const current = items.find((i) => pathname.startsWith(i.path));

  return (
    <SubLayout items={items} title={current?.label ?? t('settings.advancedNav.about')}>
      <Outlet />
    </SubLayout>
  );
}
