import { memo } from 'react';
import type { ChatMessageProps } from './types';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import LoadingMessage from './LoadingMessage';
import ErrorMessage from './ErrorMessage';

const ChatMessage = memo(function ChatMessage(props: ChatMessageProps) {
  if (props.isLoading) {
    return <LoadingMessage providerIcon={props.providerIcon} />;
  }

  let inner: React.ReactNode;
  switch (props.message.role) {
    case 'user':
      inner = <UserMessage {...props} />;
      break;
    case 'assistant':
      inner = <AssistantMessage {...props} />;
      break;
    case 'error':
      inner = <ErrorMessage message={props.message} />;
      break;
    default:
      return null;
  }

  return (
    <div data-message-id={props.message.id} data-message-role={props.message.role}>
      {inner}
    </div>
  );
});

export default ChatMessage;

export type { ChatMessageProps, ChatMessageData, VoiceOutputHandle } from './types';
