import { useCallback } from 'react';
import { useContextMenu } from './useContextMenu';
import type { MenuDef } from './useContextMenu';
import { getAddableTypes, isImplemented } from '../components/ProviderForms';

function buildMenuDef(): MenuDef {
  const types = getAddableTypes();
  const items: MenuDef = [];
  let prevGroup: number | undefined;
  for (const p of types) {
    if (prevGroup !== undefined && p.group !== prevGroup) {
      items.push({ type: 'separator' });
    }
    items.push({ type: 'item', id: p.type, text: p.name, enabled: isImplemented(p.type) });
    prevGroup = p.group;
  }
  return items;
}

const menuDef: MenuDef = buildMenuDef();

export function useProviderMenu(onSelect: (id: string) => void) {
  const show = useContextMenu(menuDef, (id) => {
    onSelect(id);
  });

  return useCallback(
    (e: React.MouseEvent) => show(e, undefined as void),
    [show],
  );
}
