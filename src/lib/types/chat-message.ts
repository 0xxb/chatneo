import type { ToolCallData } from '../tool-call-types';
import type { MessagePart } from '../message-parts';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  duration?: number; // ms
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  thinking?: string;
  isStreaming?: boolean;
  isThinkingActive?: boolean;
  toolCalls?: ToolCallData[];
  isToolCalling?: boolean;
  attachments?: { type: 'image' | 'file'; url: string; name: string }[];
  mediaParts?: MessagePart[];
  usage?: TokenUsage;
  ragResults?: import('../knowledge-base').SearchResult[];
  searchResults?: SearchResultItem[];
  ownSearchResults?: SearchResultItem[];
}
