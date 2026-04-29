import type { Attachment } from '../MessageInput/types';

// Re-export shared types from canonical location
export type { TokenUsage, SearchResultItem, ChatMessageData } from '../../lib/types/chat-message';

// UI-specific types
export interface VoiceOutputHandle {
  status: string;
  playingText: string;
  play: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

export interface ChatMessageProps {
  message: import('../../lib/types/chat-message').ChatMessageData;
  isLoading?: boolean;
  providerIcon?: string;
  voiceOutput?: VoiceOutputHandle;
  onRegenerate?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newText: string, attachments: Attachment[]) => void;
  onBranchConversation?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
}
