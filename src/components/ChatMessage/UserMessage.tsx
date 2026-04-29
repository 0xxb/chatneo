import { Pen, Ellipsis } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MessageActions, { ActionButton, CopyButton } from './MessageActions';
import AttachmentTile from '../ui/AttachmentTile';
import { useChatStore } from '../../store/chat';
import { useMessageMenu } from './useMessageMenu';
import MessageInput from '../MessageInput';
import type { ChatMessageProps } from './types';

export default function UserMessage({ message, onEditMessage, onBranchConversation, onDeleteMessage }: ChatMessageProps) {
  const { t } = useTranslation();
  const startEditMessage = useChatStore((s) => s.startEditMessage);
  const isEditingThis = useChatStore((s) => s.editingMessageId === message.id);
  const showMenu = useMessageMenu({ onBranchConversation, onDeleteMessage });
  const allAttachments = message.attachments ?? [];

  if (isEditingThis) {
    return (
      <MessageInput
        onEditMessage={onEditMessage}
        inline
      />
    );
  }

  return (
    <div className="group" data-role="user">
      <div className="flex justify-end">
        <div className="chat-bubble max-w-[75%] rounded-2xl px-4 py-2.5 bg-(--color-fill-secondary) text-(--color-label) text-chat whitespace-pre-wrap break-words select-text">
          {allAttachments.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5 mb-2 max-w-[30rem]">
              {allAttachments.map((att) => (
                <AttachmentTile
                  key={att.name}
                  type={att.type}
                  name={att.name}
                  url={att.url}
                  className="w-full aspect-square"
                  previewable
                />
              ))}
            </div>
          )}
          {message.content}
        </div>
      </div>
      <MessageActions align="right">
        <CopyButton text={message.content} />
        <ActionButton
          title={t('common.edit')}
          icon={<Pen className="w-3.5 h-3.5" />}
          onClick={() => startEditMessage(message.id)}
        />
        <ActionButton title={t('common.more')} icon={<Ellipsis className="w-3.5 h-3.5" />} onClick={(e) => showMenu(e, message.id)} />
      </MessageActions>
    </div>
  );
}
