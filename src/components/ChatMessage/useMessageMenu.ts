import { ask } from '@tauri-apps/plugin-dialog';
import { useContextMenu } from '../../hooks/useContextMenu';
import { screenshotAll, screenshotRound, screenshotMessage } from '../../utils/screenshot';
import { toast } from 'sonner';

interface MessageMenuCallbacks {
  onBranchConversation?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
}

export function useMessageMenu({ onBranchConversation, onDeleteMessage }: MessageMenuCallbacks) {
  return useContextMenu<string>(
    [
      { type: 'item', id: 'branch', text: '从此处创建新会话' },
      { type: 'submenu', text: '截图', items: [
        { type: 'item', id: 'screenshot-all', text: '整个回合' },
        { type: 'item', id: 'screenshot-round', text: '当前回合' },
        { type: 'item', id: 'screenshot-message', text: '当前消息' },
      ]},
      { type: 'separator' },
      { type: 'item', id: 'delete', text: '删除消息' },
    ],
    async (id, msgId) => {
      if (id === 'branch') onBranchConversation?.(msgId);
      if (id === 'screenshot-all' || id === 'screenshot-round' || id === 'screenshot-message') {
        toast.loading('正在截图...', { id: 'screenshot' });
        try {
          if (id === 'screenshot-all') await screenshotAll();
          else if (id === 'screenshot-round') await screenshotRound(msgId);
          else await screenshotMessage(msgId);
          toast.success('已复制到剪贴板', { id: 'screenshot' });
        } catch {
          toast.error('截图失败', { id: 'screenshot' });
        }
        return;
      }
      if (id === 'delete') {
        const confirmed = await ask('确定要删除这条消息吗？', {
          title: '删除消息',
          kind: 'warning',
          okLabel: '删除',
          cancelLabel: '取消',
        });
        if (confirmed) onDeleteMessage?.(msgId);
      }
    },
  );
}
