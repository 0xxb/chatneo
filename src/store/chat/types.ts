import type { Attachment } from '../../components/MessageInput/types';
import type { ToolCallData } from '../../lib/tool-call-types';

// --- DB row types ---

export interface ConversationRow {
  id: string;
  title: string;
  provider_id: number | null;
  model_id: string;
  pinned: number;
  archived: number;
  summary: string;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  thinking: string;
  parts: string;
  token_count: string | null; // JSON: TokenUsage
  rag_results: string;
  search_results: string;
  created_at: number;
  attachments?: Attachment[];
}

// --- Streaming state per conversation ---

export interface StreamingState {
  content: string;
  thinking: string;
  messageId: string;
  abortController: AbortController;
  toolCalls: ToolCallData[];
  mediaType?: 'image' | 'video' | 'search';
  mediaStartTime?: number;
  ragResultsJson?: string;
}

export interface ComparisonStreamingState {
  type: 'comparison';
  streams: Map<string, StreamingState>; // key = `${providerId}:${modelId}`
  finishedKeys: Set<string>; // 已完成流式的 modelKey
}

// --- Store state interface ---

export interface ChatState {
  conversations: ConversationRow[];
  activeConversationId: string | null;
  messages: MessageRow[];
  editingMessageId: string | null;
  hasMoreConversations: boolean;
  isLoadingMore: boolean;
  searchResults: ConversationRow[] | null;
  isSearching: boolean;

  // Streaming state — per conversation
  streamingMap: Map<string, StreamingState | ComparisonStreamingState>;

  loadConversations: () => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  searchConversations: (keyword: string) => Promise<void>;
  setActiveConversation: (id: string | null) => Promise<void>;
  createConversation: () => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  newChat: () => void;
  startEditMessage: (messageId: string) => void;
  cancelEditMessage: () => void;
  updateMessageContent: (messageId: string, content: string) => Promise<void>;
  deleteMessagesFrom: (messageId: string) => Promise<MessageRow[]>;
  clearMessages: () => Promise<void>;
  setStreaming: (convId: string, state: StreamingState | null) => void;
  updateStreamingContent: (convId: string, content: string) => void;
  updateStreamingThinking: (convId: string, thinking: string) => void;
  updateStreamingToolCalls: (convId: string, toolCalls: ToolCallData[]) => void;
  stopStreaming: (convId: string) => Promise<void>;
  stopAnyStreaming: (convId: string) => Promise<void>;
  setComparisonStreaming: (convId: string, state: ComparisonStreamingState | null) => void;
  updateComparisonStreamContent: (convId: string, modelKey: string, content: string) => void;
  updateComparisonStreamThinking: (convId: string, modelKey: string, thinking: string) => void;
  updateComparisonStreamToolCalls: (convId: string, modelKey: string, toolCalls: ToolCallData[]) => void;
  stopComparisonStreaming: (convId: string) => Promise<void>;
  pinConversation: (id: string) => Promise<void>;
  archiveConversation: (id: string) => Promise<void>;
  loadArchivedConversations: () => Promise<void>;
  archivedConversations: ConversationRow[];
  createBranchConversation: (messageId: string) => Promise<void>;
  deleteSingleMessage: (messageId: string) => Promise<void>;

  // TTS auto-read callback (set by Home component)
  autoReadCallback: { convId: string; cb: (text: string) => void } | null;
  setAutoReadCallback: (convId: string, cb: ((text: string) => void) | null) => void;
}

/** Zustand slice creator type for ChatState. */
export type ChatSlice = (
  set: (fn: (s: ChatState) => Partial<ChatState>) => void,
  get: () => ChatState,
) => Partial<ChatState>;
