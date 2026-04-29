import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Trash2 } from 'lucide-react';
import Spinner from '../ui/Spinner';
import ProviderIcon from '../ProviderIcon';
import type { Conversation } from './types';

export default function ConversationItem({
  conversation,
  isActive,
  isRenaming,
  isStreaming,
  providerIcon,
  onClick,
  onRename,
  onDelete,
  onContextMenu,
}: {
  conversation: Conversation;
  isActive: boolean;
  isRenaming: boolean;
  isStreaming: boolean;
  providerIcon?: string;
  onClick: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = useState(conversation.title);

  useEffect(() => {
    if (isRenaming) {
      setEditValue(conversation.title);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming, conversation.title]);

  const commitRename = () => {
    onRename(conversation.id, editValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onRename(conversation.id, conversation.title);
    }
  };

  return (
    <div
      className={`group flex items-center w-full min-w-0 px-2 py-1.5 rounded-md cursor-default transition-colors mt-0.5 ${
        isActive
          ? 'bg-(--color-fill-secondary)'
          : 'hover:bg-(--color-fill)'
      }`}
      role="button"
      tabIndex={0}
      onClick={() => onClick(conversation.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(conversation.id);
        }
      }}
      onContextMenu={(e) => onContextMenu(e, conversation.id)}
    >
      {isStreaming
        ? <Spinner className="w-4 h-4 text-(--color-accent) shrink-0" />
        : providerIcon
          ? <ProviderIcon icon={providerIcon} size={16} className="text-(--color-label-tertiary)" />
          : <MessageSquare className="w-4 h-4 text-(--color-label-tertiary) shrink-0" />
      }
      {isRenaming ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 ml-2 text-xs text-(--color-label) bg-(--color-fill) outline-none rounded px-1 py-0.5 ring-1.5 ring-(--color-focus-ring)"
        />
      ) : (
        <span className="flex-1 min-w-0 ml-2 text-xs text-(--color-label) truncate" title={conversation.title}>{conversation.title}</span>
      )}
      {!isRenaming && (
        <button
          className="shrink-0 w-0 overflow-hidden opacity-0 group-hover:w-3.5 group-hover:ml-2 group-hover:opacity-100 text-(--color-label-tertiary) hover:text-(--color-destructive) transition-[width,margin-left,opacity] duration-150"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(conversation.id);
          }}
          aria-label={t('common.delete')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
