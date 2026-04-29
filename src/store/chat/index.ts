import { create } from 'zustand';
import type { ChatState } from './types';
import { createConversationSlice } from './conversations';
import { createStreamingSlice } from './streaming';
import { createMessagesSlice } from './messages';

export type { ConversationRow, MessageRow, StreamingState, ComparisonStreamingState } from './types';

export const useChatStore = create<ChatState>((set, get) => ({
  ...createConversationSlice(set, get),
  ...createStreamingSlice(set, get),
  ...createMessagesSlice(set, get),
}) as ChatState);
