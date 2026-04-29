import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (hoisted so vi.mock factories can reference them) ---

const { mockSave, mockWriteFile, mockInvoke, mockBasename } = vi.hoisted(() => ({
  mockSave: vi.fn(),
  mockWriteFile: vi.fn(),
  mockInvoke: vi.fn(),
  mockBasename: vi.fn((p: string) => p.split('/').pop() ?? ''),
}));

vi.mock('../db', () => ({ getDb: vi.fn() }));
vi.mock('../dao/message-dao', () => ({ getMessages: vi.fn() }));
vi.mock('../dao/attachment-dao', () => ({ getAttachmentsByConversation: vi.fn() }));
vi.mock('../dao/provider-dao', () => ({ getProviderById: vi.fn() }));
vi.mock('../attachments', () => ({
  readImageAsDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
  readFileAsDataUrl: vi.fn().mockResolvedValue('data:video/mp4;base64,xyz'),
  getFileSize: vi.fn().mockResolvedValue(1024),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../apply-settings', () => ({
  getSettingValue: vi.fn().mockReturnValue(null),
  PRESET_BACKGROUNDS: {},
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mockSave }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: mockWriteFile }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/path', () => ({ basename: mockBasename }));

import { getDb } from '../db';
import {
  fetchConversationData,
  exportAsMarkdown,
  exportAsHtml,
  exportAsPdf,
} from '../../utils/export-conversation';
import { makeMsg, setupExportMocks as setupMocks } from './test-export-helpers';

describe('fetchConversationData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns title, model, and messages', async () => {
    const msgs = [makeMsg()];
    setupMocks(msgs);
    const data = await fetchConversationData('c1');
    expect(data.title).toBe('测试会话');
    expect(data.model).toBe('gpt-4');
    expect(data.messages).toHaveLength(1);
  });

  it('includes provider name in model when provider_id is set', async () => {
    setupMocks([makeMsg()], { provider_id: 1, providerName: 'OpenAI', model_id: 'gpt-4o' });
    const data = await fetchConversationData('c1');
    expect(data.model).toBe('OpenAI / gpt-4o');
  });

  it('throws when conversation not found', async () => {
    const mockDb = { select: vi.fn().mockResolvedValue([]) };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    await expect(fetchConversationData('nonexistent')).rejects.toThrow('会话不存在');
  });

  it('attaches attachments to corresponding messages', async () => {
    const msgs = [makeMsg({ id: 'm1' }), makeMsg({ id: 'm2', role: 'assistant', content: 'Hi' })];
    const attachments = [
      { id: 'a1', message_id: 'm1', type: 'image', name: 'photo.png', path: '/photo.png' },
      { id: 'a2', message_id: 'm1', type: 'file', name: 'doc.pdf', path: '/doc.pdf' },
    ];
    setupMocks(msgs, { attachments });
    const data = await fetchConversationData('c1');
    expect(data.messages[0].attachments).toHaveLength(2);
    expect(data.messages[1].attachments).toBeUndefined();
  });
});

describe('exportAsMarkdown', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates markdown and writes to file', async () => {
    const msgs = [
      makeMsg({ role: 'user', content: '你好' }),
      makeMsg({ id: 'm2', role: 'assistant', content: '你好！有什么可以帮你的？' }),
    ];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.md');

    await exportAsMarkdown('c1');

    expect(mockSave).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledWith('/tmp/test.md', expect.any(Uint8Array));

    const written = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(written).toContain('# 测试会话');
    expect(written).toContain('> 模型：gpt-4');
    expect(written).toContain('### 用户');
    expect(written).toContain('### 助手');
    expect(written).toContain('你好');
    expect(written).toContain('你好！有什么可以帮你的？');
  });

  it('does not write when user cancels save dialog', async () => {
    setupMocks([makeMsg()]);
    mockSave.mockResolvedValue(null);
    await exportAsMarkdown('c1');
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('includes thinking in details block', async () => {
    const msgs = [makeMsg({ role: 'assistant', content: '答案', thinking: '让我想想...' })];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.md');

    await exportAsMarkdown('c1');

    const written = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(written).toContain('<details>');
    expect(written).toContain('<summary>思考过程</summary>');
    expect(written).toContain('让我想想...');
  });

  it('includes RAG citations', async () => {
    const ragResults = JSON.stringify([
      { chunk_id: 1, document_id: 'd1', content: '相关内容', position: 0, distance: 0.2, document_name: '文档A', document_type: 'pdf' },
    ]);
    const msgs = [makeMsg({ role: 'assistant', content: '答案', rag_results: ragResults })];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.md');

    await exportAsMarkdown('c1');

    const written = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(written).toContain('引用来源');
    expect(written).toContain('文档A');
    expect(written).toContain('80.0%');
  });

  it('includes image and video parts', async () => {
    const parts = JSON.stringify([
      { type: 'image', path: '/gen.png', mediaType: 'image/png', revisedPrompt: '一只猫' },
      { type: 'video', path: '/gen.mp4', mediaType: 'video/mp4' },
    ]);
    const msgs = [makeMsg({ role: 'assistant', content: '生成完毕', parts })];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.md');

    await exportAsMarkdown('c1');

    const written = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(written).toContain('![一只猫](/gen.png)');
    expect(written).toContain('🎬 [生成的视频](/gen.mp4)');
  });

  it('includes attachments', async () => {
    const msgs = [makeMsg({
      attachments: [
        { id: 'a1', type: 'image', name: '截图.png', path: '/att/截图.png' },
        { id: 'a2', type: 'file', name: '报告.pdf', path: '/att/报告.pdf' },
      ],
    })];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.md');

    await exportAsMarkdown('c1');

    const written = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(written).toContain('![截图.png]');
    expect(written).toContain('📎 [报告.pdf]');
  });
});

describe('exportAsHtml', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates valid HTML document', async () => {
    const msgs = [
      makeMsg({ role: 'user', content: '你好' }),
      makeMsg({ id: 'm2', role: 'assistant', content: '**加粗**和`代码`' }),
    ];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.html');

    await exportAsHtml('c1');

    const written = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(written).toContain('<!DOCTYPE html>');
    expect(written).toContain('<html lang="zh-CN">');
    expect(written).toContain('<title>测试会话</title>');
    expect(written).toContain('模型：gpt-4');
    expect(written).toContain('class="message user"');
    expect(written).toContain('class="message assistant"');
  });

  it('escapes HTML in user content to prevent XSS', async () => {
    const msgs = [makeMsg({ role: 'user', content: '<script>alert("xss")</script>' })];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.html');

    await exportAsHtml('c1');

    const written = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(written).not.toContain('<script>');
    expect(written).toContain('&lt;script&gt;');
  });

  it('does not write when user cancels', async () => {
    setupMocks([makeMsg()]);
    mockSave.mockResolvedValue(null);
    await exportAsHtml('c1');
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('renders thinking as details element', async () => {
    const msgs = [makeMsg({ role: 'assistant', content: '结果', thinking: '分析中...' })];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.html');

    await exportAsHtml('c1');

    const written = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(written).toContain('class="thinking"');
    expect(written).toContain('思考过程');
  });

  it('renders error messages with error class', async () => {
    const msgs = [makeMsg({ role: 'error', content: '发生错误' })];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.html');

    await exportAsHtml('c1');

    const written = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(written).toContain('class="message error"');
  });

  it('renders RAG citations in HTML', async () => {
    const ragResults = JSON.stringify([
      { chunk_id: 1, document_id: 'd1', content: '内容', position: 0, distance: 0.3, document_name: '知识库文档', document_type: 'md' },
    ]);
    const msgs = [makeMsg({ role: 'assistant', content: '回答', rag_results: ragResults })];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.html');

    await exportAsHtml('c1');

    const written = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(written).toContain('class="citations"');
    expect(written).toContain('知识库文档');
    expect(written).toContain('70.0%');
  });
});

describe('exportAsPdf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates HTML, invokes backend, and writes PDF', async () => {
    setupMocks([makeMsg({ role: 'user', content: '你好' })]);
    mockInvoke.mockResolvedValue([0x25, 0x50, 0x44, 0x46]); // %PDF
    mockSave.mockResolvedValue('/tmp/test.pdf');

    await exportAsPdf('c1');

    expect(mockInvoke).toHaveBeenCalledWith('export_pdf', { html: expect.stringContaining('<!DOCTYPE html>') });
    expect(mockWriteFile).toHaveBeenCalledWith('/tmp/test.pdf', expect.any(Uint8Array));
  });

  it('does not write when user cancels', async () => {
    setupMocks([makeMsg()]);
    mockInvoke.mockResolvedValue([]);
    mockSave.mockResolvedValue(null);
    await exportAsPdf('c1');
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
