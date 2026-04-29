import { useRef, useCallback } from 'react';
import {
  Menu,
  MenuItem,
  PredefinedMenuItem,
  Submenu,
} from '@tauri-apps/api/menu';

type MenuItemDef =
  | { type: 'item'; id: string; text: string; enabled?: boolean; accelerator?: string }
  | { type: 'separator' }
  | { type: 'submenu'; text: string; items: MenuItemDef[] };

type MenuDef = MenuItemDef[];

async function buildMenuItems(
  items: MenuDef,
  handler: (id: string) => void,
): Promise<Array<MenuItem | PredefinedMenuItem | Submenu>> {
  return Promise.all(
    items.map(async (item) => {
      if (item.type === 'separator') {
        return PredefinedMenuItem.new({ item: 'Separator' });
      }
      if (item.type === 'submenu') {
        const children = await buildMenuItems(item.items, handler);
        return Submenu.new({ text: item.text, items: children });
      }
      return MenuItem.new({
        id: item.id,
        text: item.text,
        enabled: item.enabled,
        accelerator: item.accelerator,
        action: () => handler(item.id),
      });
    }),
  );
}

/**
 * 创建可复用的原生右键菜单。
 *
 * @param items  菜单结构定义，或返回定义的函数（每次右键时调用，可获取最新状态）
 * @param onAction  点击回调，接收 (menuItemId, context)；context 由 `show` 时传入
 *
 * @example
 * const show = useContextMenu(
 *   [
 *     { type: 'item', id: 'rename', text: '重命名' },
 *     { type: 'separator' },
 *     { type: 'item', id: 'delete', text: '删除' },
 *   ],
 *   (id, ctx) => {
 *     if (id === 'delete') deleteConversation(ctx);
 *   },
 * );
 *
 * <div onContextMenu={(e) => show(e, conversation.id)} />
 */
export function useContextMenu<T = void>(
  items: MenuDef | ((context: T) => MenuDef),
  onAction: (id: string, context: T) => void,
) {
  const contextRef = useRef<T | undefined>(undefined);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const show = useCallback(async (e: React.MouseEvent, context: T) => {
    e.preventDefault();
    e.stopPropagation();
    contextRef.current = context;

    const def = typeof itemsRef.current === 'function' ? itemsRef.current(context) : itemsRef.current;
    const handler = (id: string) => {
      onActionRef.current(id, contextRef.current as T);
    };
    const built = await buildMenuItems(def, handler);
    const menu = await Menu.new({ items: built });
    menu.popup();
  }, []);

  return show;
}

export type { MenuDef, MenuItemDef };
