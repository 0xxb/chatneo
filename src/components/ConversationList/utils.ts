import type { TFunction } from 'i18next';
import type { Conversation } from './types';
import type { MenuDef } from '../../hooks/useContextMenu';
import { isPluginEnabled } from '../../lib/plugin-runtime';

export function buildConversationMenuDef(conv: Conversation | undefined, t: TFunction): MenuDef {
  const isPinned = conv?.pinned === 1;
  const isArchived = conv?.archived === 1;
  return [
    { type: 'item', id: 'rename', text: t('conversation.rename') },
    { type: 'item', id: 'generate-title', text: t('conversation.generateTitle'), enabled: isPluginEnabled('generate-title') },
    { type: 'item', id: 'compress-context', text: t('conversation.compressContext'), enabled: isPluginEnabled('context-compress') },
    { type: 'item', id: 'pin', text: isPinned ? t('conversation.unpin') : t('conversation.pin') },
    { type: 'item', id: 'archive', text: isArchived ? t('conversation.unarchive') : t('conversation.archive') },
    {
      type: 'submenu',
      text: t('conversation.exportConversation'),
      items: [
        { type: 'item', id: 'export-md', text: 'Markdown' },
        { type: 'item', id: 'export-html', text: 'HTML' },
        { type: 'item', id: 'export-pdf', text: 'PDF' },
        { type: 'item', id: 'export-docx', text: 'Word' },
      ],
    },
    { type: 'separator' },
    { type: 'item', id: 'delete', text: t('conversation.delete') },
  ];
}

export interface ConversationGroup {
  label: string;
  items: Conversation[];
  collapsible: boolean;
}

export function groupConversations(conversations: Conversation[], archived: Conversation[] = [], t: TFunction): ConversationGroup[] {
  const pinned: Conversation[] = [];
  const normal: Conversation[] = [];

  for (const conv of conversations) {
    if (conv.pinned) pinned.push(conv);
    else normal.push(conv);
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const labelToday = t('conversation.today');
  const labelYesterday = t('conversation.yesterday');
  const labelThisWeek = t('conversation.thisWeek');
  const labelThisMonth = t('conversation.thisMonth');
  const labelEarlier = t('conversation.earlier');

  const groups: Record<string, Conversation[]> = {};
  const order = [labelToday, labelYesterday, labelThisWeek, labelThisMonth, labelEarlier];

  for (const conv of normal) {
    const ts = new Date(conv.updated_at * 1000);
    let label: string;
    if (ts >= today) {
      label = labelToday;
    } else if (ts >= yesterday) {
      label = labelYesterday;
    } else if (ts >= weekStart) {
      label = labelThisWeek;
    } else if (ts >= monthStart) {
      label = labelThisMonth;
    } else {
      label = labelEarlier;
    }
    (groups[label] ??= []).push(conv);
  }

  const result: ConversationGroup[] = [];

  if (pinned.length > 0) {
    result.push({ label: t('conversation.pinned'), items: pinned, collapsible: false });
  }

  if (archived.length > 0) {
    result.push({ label: t('conversation.archived'), items: archived, collapsible: true });
  }

  for (const label of order) {
    if (groups[label]) {
      result.push({ label, items: groups[label], collapsible: true });
    }
  }

  return result;
}
