import { vi } from 'vitest';
import { getDb } from '../db';
import { getMessages } from '../dao/message-dao';
import { getAttachmentsByConversation } from '../dao/attachment-dao';
import { getProviderById } from '../dao/provider-dao';
import type { MessageRow } from '../../store/chat';

export function makeMsg(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'm1',
    conversation_id: 'c1',
    role: 'user',
    content: 'Hello',
    thinking: '',
    parts: '',
    token_count: null,
    rag_results: '',
    search_results: '',
    created_at: 1000,
    ...overrides,
  };
}

export function setupExportMocks(msgs: MessageRow[], opts: {
  title?: string;
  model_id?: string;
  provider_id?: number | null;
  providerName?: string;
  attachments?: { id: string; message_id: string; type: string; name: string; path: string }[];
} = {}) {
  const {
    title = '测试会话',
    model_id = 'gpt-4',
    provider_id = null,
    providerName = 'OpenAI',
    attachments = [],
  } = opts;

  const mockDb = { select: vi.fn().mockResolvedValue([{ title, provider_id, model_id }]) };
  vi.mocked(getDb).mockResolvedValue(mockDb as any);
  vi.mocked(getMessages).mockResolvedValue(msgs);
  vi.mocked(getAttachmentsByConversation).mockResolvedValue(attachments as any);
  if (provider_id != null) {
    vi.mocked(getProviderById).mockResolvedValue({ id: provider_id, name: providerName } as any);
  } else {
    vi.mocked(getProviderById).mockResolvedValue(null as any);
  }
}
