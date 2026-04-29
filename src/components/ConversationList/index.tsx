import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { Search, ChevronRight } from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';
import { ScrollArea } from '../ui/ScrollArea';
import Spinner from '../ui/Spinner';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useProviderIconMap } from '../../hooks/useProviderIconMap';
import { useChatStore } from '../../store/chat';
import { logger } from '../../lib/logger';
import { getPluginConfig } from '../../lib/plugin-runtime';
import { getMessagesByConversation } from '../../lib/dao/message-dao';
import { generateTitle } from '../../plugins/generate-title/generate-title';
import { compressContext, MIN_MESSAGES_FOR_COMPRESS, getUncompressedCount } from '../../plugins/context-compress/compress';
import { exportAsMarkdown, exportAsHtml, exportAsPdf } from '../../utils/export-conversation';
import { exportAsDocx } from '../../utils/export-docx';
import { toast } from 'sonner';
import { buildConversationMenuDef, groupConversations } from './utils';
import ConversationItem from './ConversationItem';
import UserInfo from './UserInfo';

export default function ConversationList() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set([t('conversation.archived')]));
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const getProviderIcon = useProviderIconMap();

  const conversations = useChatStore((s) => s.conversations);
  const archivedConversations = useChatStore((s) => s.archivedConversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const pinConversation = useChatStore((s) => s.pinConversation);
  const archiveConversation = useChatStore((s) => s.archiveConversation);
  const loadArchivedConversations = useChatStore((s) => s.loadArchivedConversations);
  const loadMoreConversations = useChatStore((s) => s.loadMoreConversations);
  const hasMore = useChatStore((s) => s.hasMoreConversations);
  const isLoadingMore = useChatStore((s) => s.isLoadingMore);
  const searchConversations = useChatStore((s) => s.searchConversations);
  const searchResults = useChatStore((s) => s.searchResults);
  const isSearching = useChatStore((s) => s.isSearching);
  const streamingIds = useChatStore(useShallow((s) => [...s.streamingMap.keys()]));

  const viewportRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load archived conversations on mount
  useEffect(() => {
    loadArchivedConversations();
  }, [loadArchivedConversations]);

  // Debounced DB search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!search.trim()) {
      searchConversations('');
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchConversations(search);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, searchConversations]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      if (scrollHeight - scrollTop - clientHeight < 50) {
        loadMoreConversations();
      }
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [loadMoreConversations]);

  const showContextMenu = useContextMenu<string>(
    (id) => {
      const allConvs = [...conversations, ...archivedConversations];
      const conv = allConvs.find((c) => c.id === id);
      return buildConversationMenuDef(conv, t);
    },
    (action, id) => {
      switch (action) {
        case 'rename':
          setRenamingId(id);
          break;
        case 'generate-title': {
          const s = useChatStore.getState();
          const conv = s.conversations.find((c) => c.id === id) ?? s.archivedConversations.find((c) => c.id === id);
          if (!conv) break;
          getMessagesByConversation(id).then(async (msgs) => {
            if (msgs.length === 0) return;
            const { config } = await getPluginConfig('generate-title');
            await generateTitle(id, conv, msgs, config as { trigger: 'disabled' | 'first_message' | 'every_message'; provider_id: number | null; model_id: string });
          }).catch((e) => logger.warn('plugin', `生成标题失败: ${e}`));
          break;
        }
        case 'compress-context': {
          const s2 = useChatStore.getState();
          const conv = s2.conversations.find((c) => c.id === id) ?? s2.archivedConversations.find((c) => c.id === id);
          if (!conv) break;
          getMessagesByConversation(id).then(async (msgs) => {
            const chatMsgs = msgs.filter((m) => m.role === 'user' || m.role === 'assistant');
            if (getUncompressedCount(chatMsgs.length, conv.summary) < MIN_MESSAGES_FOR_COMPRESS) {
              toast.error(t('conversation.tooFewMessages'));
              return;
            }
            const { config } = await getPluginConfig('context-compress');
            await compressContext(id, conv, chatMsgs, config as { threshold: number; provider_id: number | null; model_id: string });
          }).catch((e) => logger.warn('plugin', `压缩上下文失败: ${e}`));
          break;
        }
        case 'pin':
          pinConversation(id);
          break;
        case 'archive':
          archiveConversation(id);
          break;
        case 'export-md':
          exportAsMarkdown(id).then(() => toast.success(t('conversation.exportSuccess'))).catch(() => toast.error(t('conversation.exportFailed')));
          break;
        case 'export-html':
        case 'export-pdf':
        case 'export-docx': {
          const exportFns: Record<string, (id: string) => Promise<void>> = { 'export-html': exportAsHtml, 'export-pdf': exportAsPdf, 'export-docx': exportAsDocx };
          const exportFn = exportFns[action];
          exportFn(id).then(() => toast.success(t('conversation.exportSuccess'))).catch(() => toast.error(t('conversation.exportFailed')));
          break;
        }
        case 'delete':
          handleDelete(id);
          break;
      }
    },
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    showContextMenu(e, id);
  }, [showContextMenu]);

  const displayList = searchResults !== null ? searchResults : conversations;
  const displayArchived = searchResults !== null ? [] : archivedConversations;
  const groups = useMemo(() => groupConversations(displayList, displayArchived, t), [displayList, displayArchived, t]);

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleDelete = useCallback(async (id: string) => {
    const confirmed = await ask(t('conversation.deleteConfirm'), {
      title: t('conversation.deleteTitle'),
      kind: 'warning',
      okLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (confirmed) {
      deleteConversation(id);
    }
  }, [deleteConversation]);

  const handleRename = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (trimmed) {
      renameConversation(id, trimmed);
    }
    setRenamingId(null);
  }, [renameConversation]);

  const handleClick = useCallback((id: string) => {
    setActiveConversation(id);
  }, [setActiveConversation]);

  const renderGroup = (group: { label: string; items: typeof conversations; collapsible: boolean }) => (
    <div key={group.label} className="mb-1">
      {group.collapsible && (
        <button
          className="flex items-center gap-1 px-2 py-1.5 w-full text-left text-[11px] font-medium text-(--color-label-tertiary) tracking-wide hover:text-(--color-label-secondary) transition-colors"
          onClick={() => toggleGroup(group.label)}
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${collapsed.has(group.label) ? '' : 'rotate-90'}`} />
          {group.label}
        </button>
      )}
      {!collapsed.has(group.label) && group.items.map((conv) => (
        <ConversationItem
          key={conv.id}
          conversation={conv}
          isActive={conv.id === activeConversationId}
          isRenaming={renamingId === conv.id}
          isStreaming={streamingIds.includes(conv.id)}
          providerIcon={getProviderIcon(conv.provider_id, conv.model_id)}
          onClick={handleClick}
          onRename={handleRename}
          onDelete={handleDelete}
          onContextMenu={handleContextMenu}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-1 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--color-label-tertiary)" />
          <input
            type="text"
            data-shortcut-search
            placeholder={t('conversation.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md bg-(--color-fill) text-(--color-label) placeholder:text-(--color-label-tertiary) outline-none focus:ring-1.5 focus:ring-(--color-focus-ring) transition-shadow"
          />
        </div>
      </div>

      <ScrollArea className="flex-1" viewportRef={viewportRef}>
        <div className="px-2 pb-2">
          {groups.length === 0 && !isSearching && (
            <p className="text-xs text-(--color-label-tertiary) text-center py-8">{t('conversation.noMatch')}</p>
          )}
          {isSearching && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
          {groups.map(renderGroup)}
          {!search && hasMore && (
            <div className="flex justify-center py-3">
              {isLoadingMore && <Spinner />}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 px-2 py-1.5 border-t border-(--color-separator)">
        <UserInfo />
      </div>
    </div>
  );
}
