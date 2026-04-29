import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { emit } from '@tauri-apps/api/event';
import mammoth from 'mammoth';
import * as kbDao from './dao/knowledge-base-dao';
import { generateEmbedding, generateEmbeddings } from './embedding';
import { splitText, detectContentType } from './chunking';
import { nowUnix } from './utils';
import { logger } from './logger';

export type KnowledgeBase = kbDao.KnowledgeBaseRow;
export type KnowledgeDocument = kbDao.KnowledgeDocumentRow;
export type KnowledgeChunk = kbDao.KnowledgeChunkRow;

export interface SearchResult {
  chunk_id: number;
  document_id: string;
  content: string;
  position: number;
  distance: number;
  document_name: string;
  document_type: string;
}

// ─── Knowledge Base CRUD ───────────────────────────────────────────────────────

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  return kbDao.listKnowledgeBases();
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBase | null> {
  return kbDao.getKnowledgeBase(id);
}

export async function createKnowledgeBase(
  data: Omit<KnowledgeBase, 'id' | 'created_at' | 'updated_at'>,
): Promise<string> {
  const id = crypto.randomUUID();
  await kbDao.insertKnowledgeBase(id, data);
  logger.info('knowledge-base', `创建知识库: ${id} (${data.name})`);
  emit('knowledge-bases-changed').catch((e) => { logger.warn('knowledge-base', `emit knowledge-bases-changed 失败: ${e}`); });
  return id;
}

export async function updateKnowledgeBase(
  id: string,
  data: Partial<Omit<KnowledgeBase, 'id' | 'created_at' | 'updated_at'>>,
): Promise<void> {
  await kbDao.updateKnowledgeBase(id, data);
  emit('knowledge-bases-changed').catch((e) => { logger.warn('knowledge-base', `emit knowledge-bases-changed 失败: ${e}`); });
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  const [kb, docs] = await Promise.all([getKnowledgeBase(id), listDocuments(id)]);
  const docIds = docs.map((d) => d.id);
  if (docIds.length > 0 && kb) {
    await invoke('kb_delete_chunks', { documentIds: docIds, dimensions: kb.dimensions });
  }
  await kbDao.deleteKnowledgeBase(id);
  logger.info('knowledge-base', `删除知识库: ${id}`);
  emit('knowledge-bases-changed').catch((e) => { logger.warn('knowledge-base', `emit knowledge-bases-changed 失败: ${e}`); });
}

// ─── Document CRUD ─────────────────────────────────────────────────────────────

export async function listDocuments(knowledgeBaseId: string): Promise<KnowledgeDocument[]> {
  return kbDao.listDocuments(knowledgeBaseId);
}

export async function getDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {
  return kbDao.getDocumentChunks(documentId);
}

export async function deleteDocument(documentId: string): Promise<void> {
  const dimensions = await kbDao.getDocumentDimensions(documentId);
  if (dimensions != null) {
    await invoke('kb_delete_chunks', { documentIds: [documentId], dimensions });
  }
  await kbDao.deleteDocument(documentId);
  logger.info('knowledge-base', `删除文档: ${documentId}`);
}

export async function addDocument(
  knowledgeBaseId: string,
  file: { name: string; path: string; type: KnowledgeDocument['type'] },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowUnix();
  await kbDao.insertDocument(id, knowledgeBaseId, file.name, file.type, file.path, now);
  logger.info('knowledge-base', `添加文档: ${id} (${file.name})`);
  return id;
}

export async function addUrlDocument(
  knowledgeBaseId: string,
  url: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowUnix();
  const name = new URL(url).hostname;
  await kbDao.insertDocument(id, knowledgeBaseId, name, 'url', url, now);
  logger.info('knowledge-base', `添加 URL 文档: ${id} (${url})`);
  return id;
}

// ─── Document Processing ───────────────────────────────────────────────────────

export async function processDocument(
  knowledgeBaseId: string,
  documentId: string,
): Promise<void> {
  // Mark as processing
  await kbDao.updateDocumentStatus(documentId, 'processing');

  try {
    const doc = await kbDao.getDocument(documentId);
    if (!doc) throw new Error('文档不存在');

    const kb = await getKnowledgeBase(knowledgeBaseId);
    if (!kb) throw new Error('知识库不存在');

    // 1. Extract text
    let text: string;
    if (doc.type === 'docx') {
      const buffer = await readFile(doc.source);
      const result = await mammoth.extractRawText({ arrayBuffer: buffer.buffer as ArrayBuffer });
      text = result.value;
    } else if (doc.type === 'url') {
      text = await invoke<string>('kb_fetch_webpage', { url: doc.source });
    } else {
      // pdf, txt, md
      text = await invoke<string>('kb_parse_document', { path: doc.source, docType: doc.type });
    }

    // 2. Split into chunks
    const contentType = doc.type === 'md' ? 'markdown' : detectContentType(doc.name);
    const textChunks = await splitText(text, {
      chunkSize: kb.chunk_size,
      chunkOverlap: kb.chunk_overlap,
      type: contentType,
    });

    if (textChunks.length === 0) {
      throw new Error('文档内容为空，无法处理');
    }

    // 3. Generate embeddings in batches of 20
    const BATCH_SIZE = 20;
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
      const batch = textChunks.slice(i, i + BATCH_SIZE).map((c) => c.content);
      const batchEmbeddings = await generateEmbeddings(
        kb.embedding_provider_id,
        kb.embedding_model,
        batch,
      );
      allEmbeddings.push(...batchEmbeddings);
    }

    // 4. Auto-detect actual dimensions from embedding output
    const actualDimensions = allEmbeddings[0].length;
    if (actualDimensions !== kb.dimensions) {
      // Dimensions changed — clean up old vectors and mark existing docs for reprocessing
      const oldDimensions = kb.dimensions;
      const existingDocs = await listDocuments(knowledgeBaseId);
      const completedDocIds = existingDocs
        .filter((d) => d.id !== documentId && d.status === 'completed')
        .map((d) => d.id);
      if (completedDocIds.length > 0 && oldDimensions > 0) {
        await invoke('kb_delete_chunks', { documentIds: completedDocIds, dimensions: oldDimensions });
        await kbDao.resetDocumentsStatus(completedDocIds);
        logger.info('knowledge-base', `维度变更 ${oldDimensions} → ${actualDimensions}，已标记 ${completedDocIds.length} 个文档待重新处理`);
      }
      await kbDao.updateKnowledgeBaseDimensions(knowledgeBaseId, actualDimensions);
      logger.info('knowledge-base', `自动更新维度: ${oldDimensions} → ${actualDimensions}`);
    }

    // 5. Store via Rust backend
    const chunks = textChunks.map((chunk, i) => ({
      document_id: documentId,
      content: chunk.content,
      position: chunk.position,
      token_count: null,
      embedding: allEmbeddings[i],
    }));
    await invoke('kb_store_chunks', { chunks, dimensions: actualDimensions });

    // 6. Update status to completed
    await kbDao.updateDocumentStatus(documentId, 'completed', null, textChunks.length);
    logger.info('knowledge-base', `文档处理完成: ${documentId}, chunks=${textChunks.length}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('knowledge-base', `文档处理失败: ${documentId}: ${message}`);
    await kbDao.updateDocumentStatus(documentId, 'failed', message);
    throw err;
  }
}

// ─── Conversation-KB Association ───────────────────────────────────────────────

export async function getConversationKnowledgeBases(
  conversationId: string,
): Promise<KnowledgeBase[]> {
  return kbDao.getConversationKnowledgeBases(conversationId);
}

export async function setConversationKnowledgeBases(
  conversationId: string,
  knowledgeBaseIds: string[],
): Promise<void> {
  await kbDao.setConversationKnowledgeBases(conversationId, knowledgeBaseIds);
}

// ─── Search ────────────────────────────────────────────────────────────────────

export async function searchKnowledgeBases(
  knowledgeBaseIds: string[],
  query: string,
  topK: number = 5,
): Promise<SearchResult[]> {
  if (knowledgeBaseIds.length === 0) return [];

  // Load all requested KBs in one query and group by (provider, model, dimensions)
  const kbs = await kbDao.getKnowledgeBasesByIds(knowledgeBaseIds);
  const groups = new Map<string, KnowledgeBase[]>();
  for (const kb of kbs) {
    const key = `${kb.embedding_provider_id}|${kb.embedding_model}|${kb.dimensions}`;
    const group = groups.get(key) ?? [];
    group.push(kb);
    groups.set(key, group);
  }

  // Search each group concurrently with its own embedding config
  const groupResults = await Promise.all(
    [...groups.values()].map(async (group) => {
      const { embedding_provider_id, embedding_model, dimensions } = group[0];
      const ids = group.map((kb) => kb.id);
      const queryEmbedding = await generateEmbedding(embedding_provider_id, embedding_model, query);
      return invoke<SearchResult[]>('kb_search_chunks', {
        knowledgeBaseIds: ids,
        queryEmbedding,
        dimensions,
        topK,
      });
    }),
  );
  const allResults = groupResults.flat();

  // Sort by distance and take top K
  allResults.sort((a, b) => a.distance - b.distance);
  const topResults = allResults.slice(0, topK);

  // 过滤低相关度结果（相似度 = 1 - distance，低于 20% 视为不相关）
  const filtered = topResults.filter((r) => r.distance < 0.8);

  logger.info('knowledge-base', `搜索完成: query="${query}", 结果数=${allResults.length}, 过滤后=${filtered.length}`);
  return filtered;
}

export function buildRagContext(results: SearchResult[]): string {
  if (results.length === 0) return '';

  const sections = results.map((r, i) =>
    `[${i + 1}] 来源: ${r.document_name} (${r.document_type})\n${r.content}`,
  );

  return [
    '以下是与用户问题相关的知识库内容，请参考这些内容回答问题：',
    '',
    ...sections,
    '',
    '请基于以上知识库内容，结合你的知识，为用户提供准确、有帮助的回答。',
  ].join('\n');
}
