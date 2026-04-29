import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
const mockEmit = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}));
vi.mock('mammoth', () => ({
  default: { extractRawText: vi.fn().mockResolvedValue({ value: 'docx text content' }) },
}));

const mockListKnowledgeBases = vi.fn().mockResolvedValue([]);
const mockGetKnowledgeBase = vi.fn().mockResolvedValue(null);
const mockInsertKnowledgeBase = vi.fn().mockResolvedValue(undefined);
const mockUpdateKnowledgeBase = vi.fn().mockResolvedValue(undefined);
const mockDeleteKnowledgeBase = vi.fn().mockResolvedValue(undefined);
const mockListDocuments = vi.fn().mockResolvedValue([]);
const mockGetDocument = vi.fn().mockResolvedValue(null);
const mockGetDocumentChunks = vi.fn().mockResolvedValue([]);
const mockGetDocumentDimensions = vi.fn().mockResolvedValue(null);
const mockInsertDocument = vi.fn().mockResolvedValue(undefined);
const mockDeleteDocument = vi.fn().mockResolvedValue(undefined);
const mockUpdateDocumentStatus = vi.fn().mockResolvedValue(undefined);
const mockUpdateKnowledgeBaseDimensions = vi.fn().mockResolvedValue(undefined);
const mockResetDocumentsStatus = vi.fn().mockResolvedValue(undefined);
const mockGetConversationKnowledgeBases = vi.fn().mockResolvedValue([]);
const mockSetConversationKnowledgeBases = vi.fn().mockResolvedValue(undefined);
const mockGetKnowledgeBasesByIds = vi.fn().mockResolvedValue([]);

vi.mock('../dao/knowledge-base-dao', () => ({
  listKnowledgeBases: (...args: unknown[]) => mockListKnowledgeBases(...args),
  getKnowledgeBase: (...args: unknown[]) => mockGetKnowledgeBase(...args),
  insertKnowledgeBase: (...args: unknown[]) => mockInsertKnowledgeBase(...args),
  updateKnowledgeBase: (...args: unknown[]) => mockUpdateKnowledgeBase(...args),
  deleteKnowledgeBase: (...args: unknown[]) => mockDeleteKnowledgeBase(...args),
  listDocuments: (...args: unknown[]) => mockListDocuments(...args),
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
  getDocumentChunks: (...args: unknown[]) => mockGetDocumentChunks(...args),
  getDocumentDimensions: (...args: unknown[]) => mockGetDocumentDimensions(...args),
  insertDocument: (...args: unknown[]) => mockInsertDocument(...args),
  deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args),
  updateDocumentStatus: (...args: unknown[]) => mockUpdateDocumentStatus(...args),
  updateKnowledgeBaseDimensions: (...args: unknown[]) => mockUpdateKnowledgeBaseDimensions(...args),
  resetDocumentsStatus: (...args: unknown[]) => mockResetDocumentsStatus(...args),
  getConversationKnowledgeBases: (...args: unknown[]) => mockGetConversationKnowledgeBases(...args),
  setConversationKnowledgeBases: (...args: unknown[]) => mockSetConversationKnowledgeBases(...args),
  getKnowledgeBasesByIds: (...args: unknown[]) => mockGetKnowledgeBasesByIds(...args),
}));

const mockGenerateEmbedding = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
const mockGenerateEmbeddings = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);
vi.mock('../embedding', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
  generateEmbeddings: (...args: unknown[]) => mockGenerateEmbeddings(...args),
}));

vi.mock('../chunking', () => ({
  splitText: vi.fn().mockResolvedValue([{ content: 'chunk1', position: 0 }]),
  detectContentType: vi.fn().mockReturnValue('text'),
}));
vi.mock('../utils', () => ({
  nowUnix: () => 99999,
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  listKnowledgeBases,
  getKnowledgeBase,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  listDocuments,
  getDocumentChunks,
  deleteDocument,
  addDocument,
  addUrlDocument,
  processDocument,
  getConversationKnowledgeBases,
  setConversationKnowledgeBases,
  searchKnowledgeBases,
  buildRagContext,
} from '../knowledge-base';

describe('Knowledge Base CRUD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listKnowledgeBases delegates to DAO', async () => {
    const kbs = [{ id: 'kb1', name: 'Test' }];
    mockListKnowledgeBases.mockResolvedValueOnce(kbs);
    expect(await listKnowledgeBases()).toEqual(kbs);
  });

  it('getKnowledgeBase delegates to DAO', async () => {
    mockGetKnowledgeBase.mockResolvedValueOnce({ id: 'kb1' });
    expect(await getKnowledgeBase('kb1')).toEqual({ id: 'kb1' });
  });

  it('createKnowledgeBase inserts and emits event', async () => {
    const id = await createKnowledgeBase({ name: 'New', description: '', embedding_provider_id: 1, embedding_model: 'e5', dimensions: 768, chunk_size: 1000, chunk_overlap: 200 });
    expect(id).toBeTruthy();
    expect(mockInsertKnowledgeBase).toHaveBeenCalledWith(id, expect.objectContaining({ name: 'New' }));
    expect(mockEmit).toHaveBeenCalledWith('knowledge-bases-changed');
  });

  it('updateKnowledgeBase updates and emits', async () => {
    await updateKnowledgeBase('kb1', { name: 'Updated' });
    expect(mockUpdateKnowledgeBase).toHaveBeenCalledWith('kb1', { name: 'Updated' });
    expect(mockEmit).toHaveBeenCalledWith('knowledge-bases-changed');
  });

  it('deleteKnowledgeBase with documents deletes chunks via invoke', async () => {
    mockGetKnowledgeBase.mockResolvedValueOnce({ id: 'kb1', dimensions: 768 });
    mockListDocuments.mockResolvedValueOnce([{ id: 'd1' }, { id: 'd2' }]);
    await deleteKnowledgeBase('kb1');
    expect(mockInvoke).toHaveBeenCalledWith('kb_delete_chunks', { documentIds: ['d1', 'd2'], dimensions: 768 });
    expect(mockDeleteKnowledgeBase).toHaveBeenCalledWith('kb1');
  });

  it('deleteKnowledgeBase without documents skips invoke', async () => {
    mockGetKnowledgeBase.mockResolvedValueOnce({ id: 'kb1', dimensions: 768 });
    mockListDocuments.mockResolvedValueOnce([]);
    await deleteKnowledgeBase('kb1');
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockDeleteKnowledgeBase).toHaveBeenCalledWith('kb1');
  });
});

describe('Document CRUD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listDocuments delegates', async () => {
    mockListDocuments.mockResolvedValueOnce([{ id: 'd1' }]);
    expect(await listDocuments('kb1')).toEqual([{ id: 'd1' }]);
  });

  it('getDocumentChunks delegates', async () => {
    mockGetDocumentChunks.mockResolvedValueOnce([{ content: 'c' }]);
    expect(await getDocumentChunks('d1')).toEqual([{ content: 'c' }]);
  });

  it('deleteDocument deletes chunks and document', async () => {
    mockGetDocumentDimensions.mockResolvedValueOnce(768);
    await deleteDocument('d1');
    expect(mockInvoke).toHaveBeenCalledWith('kb_delete_chunks', { documentIds: ['d1'], dimensions: 768 });
    expect(mockDeleteDocument).toHaveBeenCalledWith('d1');
  });

  it('deleteDocument skips invoke when dimensions null', async () => {
    mockGetDocumentDimensions.mockResolvedValueOnce(null);
    await deleteDocument('d1');
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockDeleteDocument).toHaveBeenCalledWith('d1');
  });

  it('addDocument inserts and returns id', async () => {
    const id = await addDocument('kb1', { name: 'doc.pdf', path: '/doc.pdf', type: 'pdf' });
    expect(id).toBeTruthy();
    expect(mockInsertDocument).toHaveBeenCalledWith(id, 'kb1', 'doc.pdf', 'pdf', '/doc.pdf', 99999);
  });

  it('addUrlDocument inserts URL doc', async () => {
    const id = await addUrlDocument('kb1', 'https://example.com/page');
    expect(id).toBeTruthy();
    expect(mockInsertDocument).toHaveBeenCalledWith(id, 'kb1', 'example.com', 'url', 'https://example.com/page', 99999);
  });
});

describe('processDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDocumentStatus.mockResolvedValue(undefined);
    mockUpdateKnowledgeBaseDimensions.mockResolvedValue(undefined);
    mockResetDocumentsStatus.mockResolvedValue(undefined);
  });

  it('processes text document (pdf/txt) via invoke', async () => {
    mockGetDocument.mockResolvedValueOnce({ id: 'd1', type: 'txt', source: '/file.txt', name: 'file.txt' });
    mockGetKnowledgeBase.mockResolvedValueOnce({ id: 'kb1', chunk_size: 1000, chunk_overlap: 200, embedding_provider_id: 1, embedding_model: 'e5', dimensions: 3 });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'kb_parse_document') return Promise.resolve('file content');
      return Promise.resolve(undefined);
    });
    mockGenerateEmbeddings.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);

    await processDocument('kb1', 'd1');
    expect(mockUpdateDocumentStatus).toHaveBeenCalledWith('d1', 'processing');
    expect(mockUpdateDocumentStatus).toHaveBeenCalledWith('d1', 'completed', null, 1);
  });

  it('processes URL document via invoke', async () => {
    mockGetDocument.mockResolvedValueOnce({ id: 'd1', type: 'url', source: 'https://example.com', name: 'example.com' });
    mockGetKnowledgeBase.mockResolvedValueOnce({ id: 'kb1', chunk_size: 1000, chunk_overlap: 200, embedding_provider_id: 1, embedding_model: 'e5', dimensions: 3 });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'kb_fetch_webpage') return Promise.resolve('webpage text');
      return Promise.resolve(undefined);
    });
    mockGenerateEmbeddings.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);

    await processDocument('kb1', 'd1');
    expect(mockInvoke).toHaveBeenCalledWith('kb_fetch_webpage', { url: 'https://example.com' });
  });

  it('throws and sets failed status on error', async () => {
    mockGetDocument.mockResolvedValueOnce(null);
    mockGetKnowledgeBase.mockResolvedValueOnce(null);

    await expect(processDocument('kb1', 'd1')).rejects.toThrow('文档不存在');
    expect(mockUpdateDocumentStatus).toHaveBeenCalledWith('d1', 'failed', '文档不存在');
  });

  it('processes docx document via mammoth', async () => {
    mockGetDocument.mockReset().mockResolvedValueOnce({ id: 'd3', type: 'docx', source: '/doc.docx', name: 'doc.docx' });
    mockGetKnowledgeBase.mockReset().mockResolvedValueOnce({ id: 'kb1', chunk_size: 1000, chunk_overlap: 200, embedding_provider_id: 1, embedding_model: 'e5', dimensions: 3 });
    mockGenerateEmbeddings.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
    mockInvoke.mockResolvedValue(undefined);

    await processDocument('kb1', 'd3');
    expect(mockReadFile).toHaveBeenCalledWith('/doc.docx');
    expect(mockUpdateDocumentStatus).toHaveBeenCalledWith('d3', 'completed', null, 1);
  });
});

describe('Conversation-KB Association', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getConversationKnowledgeBases delegates', async () => {
    mockGetConversationKnowledgeBases.mockResolvedValueOnce([{ id: 'kb1' }]);
    expect(await getConversationKnowledgeBases('c1')).toEqual([{ id: 'kb1' }]);
  });

  it('setConversationKnowledgeBases delegates', async () => {
    await setConversationKnowledgeBases('c1', ['kb1', 'kb2']);
    expect(mockSetConversationKnowledgeBases).toHaveBeenCalledWith('c1', ['kb1', 'kb2']);
  });
});

describe('searchKnowledgeBases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty for empty ids', async () => {
    expect(await searchKnowledgeBases([], 'query')).toEqual([]);
  });

  it('searches and returns filtered results', async () => {
    mockGetKnowledgeBasesByIds.mockResolvedValueOnce([
      { id: 'kb1', embedding_provider_id: 1, embedding_model: 'e5', dimensions: 3 },
    ]);
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockInvoke.mockResolvedValueOnce([
      { chunk_id: 1, document_id: 'd1', content: 'relevant', position: 0, distance: 0.3, document_name: 'doc', document_type: 'pdf' },
      { chunk_id: 2, document_id: 'd1', content: 'irrelevant', position: 1, distance: 0.9, document_name: 'doc', document_type: 'pdf' },
    ]);

    const results = await searchKnowledgeBases(['kb1'], 'test query', 5);
    expect(results).toHaveLength(1); // distance 0.9 filtered out (>= 0.8)
    expect(results[0].content).toBe('relevant');
  });

  it('groups KBs by embedding config', async () => {
    mockGetKnowledgeBasesByIds.mockResolvedValueOnce([
      { id: 'kb1', embedding_provider_id: 1, embedding_model: 'e5', dimensions: 3 },
      { id: 'kb2', embedding_provider_id: 1, embedding_model: 'e5', dimensions: 3 },
      { id: 'kb3', embedding_provider_id: 2, embedding_model: 'ada', dimensions: 4 },
    ]);
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockInvoke.mockResolvedValue([]);

    await searchKnowledgeBases(['kb1', 'kb2', 'kb3'], 'q');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});

describe('buildRagContext', () => {
  it('returns empty string for no results', () => {
    expect(buildRagContext([])).toBe('');
  });

  it('formats results with numbered sections', () => {
    const results = [
      { chunk_id: 1, document_id: 'd1', content: 'Hello world', position: 0, distance: 0.2, document_name: 'doc.pdf', document_type: 'pdf' },
      { chunk_id: 2, document_id: 'd1', content: 'Foo bar', position: 1, distance: 0.4, document_name: 'notes.md', document_type: 'md' },
    ];
    const ctx = buildRagContext(results);
    expect(ctx).toContain('[1] 来源: doc.pdf (pdf)');
    expect(ctx).toContain('Hello world');
    expect(ctx).toContain('[2] 来源: notes.md (md)');
    expect(ctx).toContain('Foo bar');
    expect(ctx).toContain('以下是与用户问题相关的知识库内容');
  });
});
