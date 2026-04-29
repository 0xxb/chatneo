import { PanelLeft } from 'lucide-react';
import { useSidebarStore } from '../../store/sidebar';
import { iconButtonClass } from './styles';

export default function SidebarToggle() {
  const toggle = useSidebarStore((s) => s.toggle);

  return (
    <button onClick={toggle} className={iconButtonClass}>
      <PanelLeft className="w-4 h-4" />
    </button>
  );
}
