import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListKnowledgeBases = vi.fn().mockResolvedValue([]);
const mockGetKnowledgeBase = vi.fn().mockResolvedValue(null);
const mockInsertKnowledgeBase = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockUpdateKnowledgeBase = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockListDocuments = vi.fn().mockResolvedValue([]);
const mockGetDocumentChunks = vi.fn().mockResolvedValue([]);
const mockGetConversationKnowledgeBases = vi.fn().mockResolvedValue([]);
const mockSetConversationKnowledgeBases = vi.fn().mockResolvedValue(undefined);
const mockEmit = vi.fn().mockResolvedValue(undefined);

vi.mock('../dao/knowledge-base-dao', () => ({
  listKnowledgeBases: () => mockListKnowledgeBases(),
  getKnowledgeBase: (...args: unknown[]) => mockGetKnowledgeBase(...args),
  insertKnowledgeBase: (...args: unknown[]) => mockInsertKnowledgeBase(...args),
  updateKnowledgeBase: (...args: unknown[]) => mockUpdateKnowledgeBase(...args),
  listDocuments: (...args: unknown[]) => mockListDocuments(...args),
  getDocumentChunks: (...args: unknown[]) => mockGetDocumentChunks(...args),
  getConversationKnowledgeBases: (...args: unknown[]) => mockGetConversationKnowledgeBases(...args),
  setConversationKnowledgeBases: (...args: unknown[]) => mockSetConversationKnowledgeBases(...args),
  deleteKnowledgeBase: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  insertDocument: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  updateDocumentStatus: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  deleteDocument: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn().mockResolvedValue('file content'),
  readFile: vi.fn().mockResolvedValue(new Uint8Array()),
}));
vi.mock('../embedding', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
}));
vi.mock('../chunking', () => ({
  splitTextToChunks: vi.fn().mockReturnValue([{ content: 'chunk1', position: 0 }]),
  extractTextContent: vi.fn().mockResolvedValue('extracted text'),
  isTextFile: vi.fn().mockReturnValue(true),
}));
vi.mock('../utils', () => ({
  nowUnix: () => 1700000000,
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  listKnowledgeBases,
  getKnowledgeBase,
  createKnowledgeBase,
  updateKnowledgeBase,
  listDocuments,
  getDocumentChunks,
  getConversationKnowledgeBases,
  setConversationKnowledgeBases,
  buildRagContext,
} from '../knowledge-base';

describe('knowledge-base', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listKnowledgeBases delegates to DAO', async () => {
    const data = [{ id: 'kb1', name: '测试', description: '', embedding_provider_id: 1, embedding_model_id: 'e5', created_at: 1000, updated_at: 1000 }];
    mockListKnowledgeBases.mockResolvedValueOnce(data);
    const result = await listKnowledgeBases();
    expect(result).toEqual(data);
  });

  it('getKnowledgeBase delegates to DAO', async () => {
    const kb = { id: 'kb1', name: '测试', description: '', embedding_provider_id: 1, embedding_model_id: 'e5', created_at: 1000, updated_at: 1000 };
    mockGetKnowledgeBase.mockResolvedValueOnce(kb);
    const result = await getKnowledgeBase('kb1');
    expect(result).toEqual(kb);
  });

  it('createKnowledgeBase generates UUID and emits event', async () => {
    const id = await createKnowledgeBase({ name: '新知识库', description: '描述', embedding_provider_id: 1, embedding_model: 'e5', dimensions: 768, chunk_size: 512, chunk_overlap: 64 });
    expect(id).toBeTruthy();
    expect(id.length).toBe(36);
    expect(mockInsertKnowledgeBase).toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith('knowledge-bases-changed');
  });

  it('updateKnowledgeBase calls DAO and emits event', async () => {
    await updateKnowledgeBase('kb1', { name: '新名称' });
    expect(mockUpdateKnowledgeBase).toHaveBeenCalledWith('kb1', expect.objectContaining({ name: '新名称' }));
    expect(mockEmit).toHaveBeenCalledWith('knowledge-bases-changed');
  });

  it('listDocuments delegates to DAO', async () => {
    mockListDocuments.mockResolvedValueOnce([{ id: 'd1' }]);
    const result = await listDocuments('kb1');
    expect(result).toEqual([{ id: 'd1' }]);
    expect(mockListDocuments).toHaveBeenCalledWith('kb1');
  });

  it('getDocumentChunks delegates to DAO', async () => {
    mockGetDocumentChunks.mockResolvedValueOnce([{ id: 'c1', content: 'text' }]);
    const result = await getDocumentChunks('d1');
    expect(result).toEqual([{ id: 'c1', content: 'text' }]);
  });

  it('getConversationKnowledgeBases delegates to DAO', async () => {
    const kbs = [{ id: 'kb1', name: '知识库' }];
    mockGetConversationKnowledgeBases.mockResolvedValueOnce(kbs);
    const result = await getConversationKnowledgeBases('conv1');
    expect(result).toEqual(kbs);
  });

  it('setConversationKnowledgeBases delegates to DAO', async () => {
    await setConversationKnowledgeBases('conv1', ['kb1', 'kb2']);
    expect(mockSetConversationKnowledgeBases).toHaveBeenCalledWith('conv1', ['kb1', 'kb2']);
  });

  describe('buildRagContext', () => {
    it('returns empty string for empty results', () => {
      expect(buildRagContext([])).toBe('');
    });

    it('formats results with numbered sources', () => {
      const results = [
        { chunk_id: 1, document_id: 'd1', content: '段落内容', position: 0, distance: 0.2, document_name: '文档.pdf', document_type: 'pdf' },
        { chunk_id: 2, document_id: 'd2', content: '另一段', position: 1, distance: 0.3, document_name: '笔记.md', document_type: 'markdown' },
      ];
      const context = buildRagContext(results);
      expect(context).toContain('[1] 来源: 文档.pdf (pdf)');
      expect(context).toContain('段落内容');
      expect(context).toContain('[2] 来源: 笔记.md (markdown)');
      expect(context).toContain('另一段');
      expect(context).toContain('请基于以上知识库内容');
    });

    it('includes header and footer text', () => {
      const results = [{ chunk_id: 1, document_id: 'd1', content: 'x', position: 0, distance: 0.1, document_name: 'a.txt', document_type: 'txt' }];
      const context = buildRagContext(results);
      expect(context).toContain('以下是与用户问题相关的知识库内容');
      expect(context).toContain('请基于以上知识库内容');
    });
  });
});
