import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDatabase } from '../../__tests__/test-db';

let testDb: TestDatabase;

vi.mock('../../db', () => ({
  getDb: () => Promise.resolve(testDb),
}));

vi.mock('../utils', () => ({
  nowUnix: () => 9999,
}));

import * as instructionDao from '../instruction-dao';
import * as providerDao from '../provider-dao';
import * as toolDao from '../tool-dao';
import * as pluginDao from '../plugin-dao';
import * as promptDao from '../prompt-dao';
import * as modelFavoriteDao from '../model-favorite-dao';
import * as kbDao from '../knowledge-base-dao';

describe('instruction-dao (integration)', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    // Create a conversation for FK
    await testDb.execute(
      "INSERT INTO conversations (id, title, provider_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ['conv1', '测试', -2, 'gpt-4', 1000, 1000],
    );
  });
  afterEach(() => { testDb.close(); });

  it('insertInstruction and listInstructions', async () => {
    await instructionDao.insertInstruction('i1', '规则1', '内容1');
    await instructionDao.insertInstruction('i2', '规则2', '内容2');
    const list = await instructionDao.listInstructions();
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('规则1');
  });

  it('updateInstruction changes fields', async () => {
    await instructionDao.insertInstruction('i1', '原标题', '原内容');
    await instructionDao.updateInstruction('i1', { title: '新标题', content: '新内容' });
    const list = await instructionDao.listInstructions();
    expect(list[0].title).toBe('新标题');
    expect(list[0].content).toBe('新内容');
  });

  it('updateInstruction rejects invalid field', async () => {
    await instructionDao.insertInstruction('i1', '标题', '内容');
    await expect(
      instructionDao.updateInstruction('i1', { invalid_field: 'x' } as any),
    ).rejects.toThrow('不允许更新的字段');
  });

  it('deleteInstruction removes it', async () => {
    await instructionDao.insertInstruction('i1', '标题', '内容');
    await instructionDao.deleteInstruction('i1');
    const list = await instructionDao.listInstructions();
    expect(list).toHaveLength(0);
  });

  it('getEnabledInstructions only returns enabled', async () => {
    await instructionDao.insertInstruction('i1', '启用', '内容');
    await instructionDao.insertInstruction('i2', '禁用', '内容');
    await instructionDao.updateInstruction('i2', { enabled: 0 });
    const enabled = await instructionDao.getEnabledInstructions();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].id).toBe('i1');
  });

  it('setConversationInstructions and getConversationInstructions', async () => {
    await instructionDao.insertInstruction('i1', '规则1', '内容1');
    await instructionDao.insertInstruction('i2', '规则2', '内容2');
    await instructionDao.setConversationInstructions('conv1', ['i1', 'i2']);

    const convInstr = await instructionDao.getConversationInstructions('conv1');
    expect(convInstr).toHaveLength(2);

    const ids = await instructionDao.getConversationInstructionIds('conv1');
    expect(ids).toContain('i1');
    expect(ids).toContain('i2');
  });

  it('setConversationInstructions replaces previous', async () => {
    await instructionDao.insertInstruction('i1', '规则1', '内容');
    await instructionDao.insertInstruction('i2', '规则2', '内容');
    await instructionDao.setConversationInstructions('conv1', ['i1', 'i2']);
    await instructionDao.setConversationInstructions('conv1', ['i2']);

    const ids = await instructionDao.getConversationInstructionIds('conv1');
    expect(ids).toEqual(['i2']);
  });
});

describe('provider-dao (integration)', () => {
  beforeEach(() => { testDb = createTestDb(); });
  afterEach(() => { testDb.close(); });

  it('insertProvider and listProviders', async () => {
    const id = await providerDao.insertProvider('openai', '🤖', 'OpenAI', '{"apiKey":"sk-test"}');
    expect(id).toBeGreaterThan(0);
    const list = await providerDao.listProviders();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('OpenAI');
    expect(list[0].type).toBe('openai');
  });

  it('getProviderById returns provider', async () => {
    const id = await providerDao.insertProvider('anthropic', '🧠', 'Anthropic', '{}');
    const row = await providerDao.getProviderById(id);
    expect(row).not.toBeNull();
    expect(row!.name).toBe('Anthropic');
  });

  it('getProviderById returns null for non-existent', async () => {
    const row = await providerDao.getProviderById(999);
    expect(row).toBeNull();
  });

  it('getProviderConfig returns type and config', async () => {
    const id = await providerDao.insertProvider('openai', '', 'Test', '{"apiKey":"key"}');
    const cfg = await providerDao.getProviderConfig(id);
    expect(cfg!.type).toBe('openai');
    expect(cfg!.config).toBe('{"apiKey":"key"}');
  });

  it('updateProviderField updates name', async () => {
    const id = await providerDao.insertProvider('openai', '', 'OldName', '{}');
    await providerDao.updateProviderField(id, 'name', 'NewName');
    const row = await providerDao.getProviderById(id);
    expect(row!.name).toBe('NewName');
  });

  it('updateProviderField rejects invalid field', async () => {
    const id = await providerDao.insertProvider('openai', '', 'Test', '{}');
    await expect(
      providerDao.updateProviderField(id, 'type' as any, 'hack'),
    ).rejects.toThrow('不允许更新的字段');
  });

  it('deleteProvider removes provider and cleans references', async () => {
    const id = await providerDao.insertProvider('openai', '', 'Test', '{}');
    // Add a conversation referencing this provider
    await testDb.execute(
      "INSERT INTO conversations (id, title, provider_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ['c1', '对话', id, 'gpt-4', 1000, 1000],
    );
    await providerDao.deleteProvider(id);

    expect(await providerDao.getProviderById(id)).toBeNull();
    // Conversation should have provider_id set to NULL
    const [conv] = await testDb.select<{ provider_id: number | null }[]>(
      'SELECT provider_id FROM conversations WHERE id = ?', ['c1'],
    );
    expect(conv.provider_id).toBeNull();
  });
});

describe('tool-dao (integration)', () => {
  beforeEach(() => { testDb = createTestDb(); });
  afterEach(() => { testDb.close(); });

  it('upsertTool and listTools', async () => {
    await toolDao.upsertTool('web-search', 1, '{"engine":"google"}');
    const list = await toolDao.listTools();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('web-search');
    expect(list[0].enabled).toBe(1);
  });

  it('upsertTool updates enabled on conflict', async () => {
    await toolDao.upsertTool('web-search', 1, '{}');
    await toolDao.upsertTool('web-search', 0, '{}');
    const list = await toolDao.listTools();
    expect(list[0].enabled).toBe(0);
  });

  it('updateToolConfig updates config on conflict', async () => {
    await toolDao.upsertTool('web-search', 1, '{"old":true}');
    await toolDao.updateToolConfig('web-search', 1, '{"new":true}');
    const config = await toolDao.getToolConfig('web-search');
    expect(config).toBe('{"new":true}');
  });

  it('getToolConfig returns null for non-existent', async () => {
    const config = await toolDao.getToolConfig('nonexistent');
    expect(config).toBeNull();
  });
});

describe('plugin-dao (integration)', () => {
  beforeEach(() => { testDb = createTestDb(); });
  afterEach(() => { testDb.close(); });

  it('upsertPlugin and listPlugins', async () => {
    await pluginDao.upsertPlugin('auto-title', 1, '{"maxLength":50}');
    const list = await pluginDao.listPlugins();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('auto-title');
  });

  it('isPluginEnabled returns true for enabled', async () => {
    await pluginDao.upsertPlugin('p1', 1, '{}');
    expect(await pluginDao.isPluginEnabled('p1')).toBe(true);
  });

  it('isPluginEnabled returns false for disabled', async () => {
    await pluginDao.upsertPlugin('p1', 0, '{}');
    expect(await pluginDao.isPluginEnabled('p1')).toBe(false);
  });

  it('isPluginEnabled returns true for non-existent (default enabled)', async () => {
    expect(await pluginDao.isPluginEnabled('nonexistent')).toBe(true);
  });

  it('updatePluginConfig updates config', async () => {
    await pluginDao.upsertPlugin('p1', 1, '{"old":1}');
    await pluginDao.updatePluginConfig('p1', '{"new":2}');
    const row = await pluginDao.getPluginById('p1');
    expect(row!.config).toBe('{"new":2}');
  });

  it('getPluginConfig returns null for non-existent', async () => {
    expect(await pluginDao.getPluginConfig('nope')).toBeNull();
  });
});

describe('prompt-dao (integration)', () => {
  beforeEach(() => { testDb = createTestDb(); });
  afterEach(() => { testDb.close(); });

  it('insertPrompt and listPrompts', async () => {
    await promptDao.insertPrompt('p1', '翻译', 'translation');
    const list = await promptDao.listPrompts();
    // May include built-in prompts from migration, just check ours exists
    const ours = list.find((p) => p.id === 'p1');
    expect(ours).toBeDefined();
    expect(ours!.title).toBe('翻译');
    expect(ours!.category).toBe('translation');
  });

  it('updatePromptField updates content', async () => {
    await promptDao.insertPrompt('p1', '标题', '');
    await promptDao.updatePromptField('p1', 'content', '新内容');
    const list = await promptDao.listPrompts();
    const p = list.find((r) => r.id === 'p1');
    expect(p!.content).toBe('新内容');
  });

  it('updatePromptField rejects invalid field', async () => {
    await promptDao.insertPrompt('p1', '标题', '');
    await expect(
      promptDao.updatePromptField('p1', 'id' as any, 'hack'),
    ).rejects.toThrow('不允许更新的字段');
  });

  it('deletePrompt removes it', async () => {
    await promptDao.insertPrompt('p1', '标题', '');
    await promptDao.deletePrompt('p1');
    const list = await promptDao.listPrompts();
    expect(list.find((p) => p.id === 'p1')).toBeUndefined();
  });
});

describe('model-favorite-dao (integration)', () => {
  beforeEach(() => { testDb = createTestDb(); });
  afterEach(() => { testDb.close(); });

  it('addFavorite and listFavorites', async () => {
    await modelFavoriteDao.addFavorite('gpt-4', -2);
    await modelFavoriteDao.addFavorite('claude-3', -3);
    const list = await modelFavoriteDao.listFavorites();
    expect(list).toHaveLength(2);
  });

  it('removeFavorite removes specific entry', async () => {
    await modelFavoriteDao.addFavorite('gpt-4', -2);
    await modelFavoriteDao.addFavorite('claude-3', -3);
    await modelFavoriteDao.removeFavorite('gpt-4', -2);
    const list = await modelFavoriteDao.listFavorites();
    expect(list).toHaveLength(1);
    expect(list[0].model_id).toBe('claude-3');
  });
});

describe('knowledge-base-dao (integration)', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    await testDb.execute(
      "INSERT INTO conversations (id, title, provider_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ['conv1', '测试', -2, 'gpt-4', 1000, 1000],
    );
  });
  afterEach(() => { testDb.close(); });

  it('insertKnowledgeBase and listKnowledgeBases', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: '知识库1', description: '测试', embedding_provider_id: -2,
      embedding_model: 'text-embedding-3-small', dimensions: 1536,
      chunk_size: 1000, chunk_overlap: 200,
    });
    const list = await kbDao.listKnowledgeBases();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('知识库1');
    expect(list[0].dimensions).toBe(1536);
  });

  it('getKnowledgeBase returns by id', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: 'KB', description: '', embedding_provider_id: null,
      embedding_model: 'nomic-embed-text', dimensions: 768,
      chunk_size: 500, chunk_overlap: 100,
    });
    const kb = await kbDao.getKnowledgeBase('kb1');
    expect(kb).not.toBeNull();
    expect(kb!.embedding_model).toBe('nomic-embed-text');
  });

  it('getKnowledgeBase returns null for non-existent', async () => {
    expect(await kbDao.getKnowledgeBase('nope')).toBeNull();
  });

  it('updateKnowledgeBase updates fields', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: '旧名', description: '', embedding_provider_id: null,
      embedding_model: 'model', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });
    await kbDao.updateKnowledgeBase('kb1', { name: '新名', dimensions: 1536 });
    const kb = await kbDao.getKnowledgeBase('kb1');
    expect(kb!.name).toBe('新名');
    expect(kb!.dimensions).toBe(1536);
  });

  it('deleteKnowledgeBase cascades to documents', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: 'KB', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });
    await kbDao.insertDocument('d1', 'kb1', 'doc.pdf', 'pdf', '/path/doc.pdf', 1000);
    await kbDao.deleteKnowledgeBase('kb1');

    expect(await kbDao.getKnowledgeBase('kb1')).toBeNull();
    expect(await kbDao.getDocument('d1')).toBeNull();
  });

  it('insertDocument and listDocuments', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: 'KB', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });
    await kbDao.insertDocument('d1', 'kb1', 'file.pdf', 'pdf', '/p/file.pdf', 1000);
    await kbDao.insertDocument('d2', 'kb1', 'notes.md', 'md', '/p/notes.md', 2000);

    const docs = await kbDao.listDocuments('kb1');
    expect(docs).toHaveLength(2);
    expect(docs[0].status).toBe('pending');
  });

  it('updateDocumentStatus to completed', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: 'KB', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });
    await kbDao.insertDocument('d1', 'kb1', 'doc.pdf', 'pdf', '/p/doc.pdf', 1000);
    await kbDao.updateDocumentStatus('d1', 'completed', null, 10);

    const doc = await kbDao.getDocument('d1');
    expect(doc!.status).toBe('completed');
    expect(doc!.chunk_count).toBe(10);
  });

  it('updateDocumentStatus to failed with error', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: 'KB', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });
    await kbDao.insertDocument('d1', 'kb1', 'doc.pdf', 'pdf', '/p', 1000);
    await kbDao.updateDocumentStatus('d1', 'failed', '解析失败');

    const doc = await kbDao.getDocument('d1');
    expect(doc!.status).toBe('failed');
    expect(doc!.error).toBe('解析失败');
  });

  it('resetDocumentsStatus resets to pending', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: 'KB', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });
    await kbDao.insertDocument('d1', 'kb1', 'a.pdf', 'pdf', '/p', 1000);
    await kbDao.updateDocumentStatus('d1', 'completed', null, 5);
    await kbDao.resetDocumentsStatus(['d1']);

    const doc = await kbDao.getDocument('d1');
    expect(doc!.status).toBe('pending');
    expect(doc!.chunk_count).toBe(0);
  });

  it('getDocumentDimensions returns kb dimensions', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: 'KB', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 1536, chunk_size: 1000, chunk_overlap: 200,
    });
    await kbDao.insertDocument('d1', 'kb1', 'doc.pdf', 'pdf', '/p', 1000);

    const dims = await kbDao.getDocumentDimensions('d1');
    expect(dims).toBe(1536);
  });

  it('setConversationKnowledgeBases and getConversationKnowledgeBases', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: 'KB1', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });
    await kbDao.insertKnowledgeBase('kb2', {
      name: 'KB2', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });

    await kbDao.setConversationKnowledgeBases('conv1', ['kb1', 'kb2']);
    const kbs = await kbDao.getConversationKnowledgeBases('conv1');
    expect(kbs).toHaveLength(2);
  });

  it('getKnowledgeBasesByIds returns subset', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: 'KB1', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });
    await kbDao.insertKnowledgeBase('kb2', {
      name: 'KB2', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });

    const result = await kbDao.getKnowledgeBasesByIds(['kb1']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('KB1');
  });

  it('getKnowledgeBasesByIds returns empty for empty input', async () => {
    expect(await kbDao.getKnowledgeBasesByIds([])).toEqual([]);
  });

  it('deleteDocument removes document and cascades chunks', async () => {
    await kbDao.insertKnowledgeBase('kb1', {
      name: 'KB', description: '', embedding_provider_id: null,
      embedding_model: 'm', dimensions: 768, chunk_size: 1000, chunk_overlap: 200,
    });
    await kbDao.insertDocument('d1', 'kb1', 'doc.pdf', 'pdf', '/p', 1000);
    // Insert a chunk
    await testDb.execute(
      "INSERT INTO knowledge_chunks (document_id, content, position) VALUES (?, ?, ?)",
      ['d1', 'chunk content', 0],
    );

    await kbDao.deleteDocument('d1');
    expect(await kbDao.getDocument('d1')).toBeNull();
    const chunks = await kbDao.getDocumentChunks('d1');
    expect(chunks).toHaveLength(0);
  });
});
