import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (hoisted so vi.mock factories can reference them) ---

const { mockSave, mockWriteFile, mockReadFile } = vi.hoisted(() => ({
  mockSave: vi.fn(),
  mockWriteFile: vi.fn(),
  mockReadFile: vi.fn(),
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
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: mockWriteFile,
  readFile: mockReadFile,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({ basename: vi.fn((p: string) => p.split('/').pop() ?? '') }));

import { exportAsDocx } from '../../utils/export-docx';
import { makeMsg, setupExportMocks as setupMocks } from './test-export-helpers';

describe('exportAsDocx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates docx and writes to file', async () => {
    setupMocks([
      makeMsg({ role: 'user', content: '你好' }),
      makeMsg({ id: 'm2', role: 'assistant', content: '你好！' }),
    ]);
    mockSave.mockResolvedValue('/tmp/test.docx');

    await exportAsDocx('c1');

    expect(mockSave).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledWith('/tmp/test.docx', expect.any(Uint8Array));
    // Verify it's a valid zip/docx (starts with PK header)
    const bytes = mockWriteFile.mock.calls[0][1] as Uint8Array;
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
  });

  it('does not write when user cancels', async () => {
    setupMocks([makeMsg()]);
    mockSave.mockResolvedValue(null);
    await exportAsDocx('c1');
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('handles messages with thinking', async () => {
    setupMocks([makeMsg({ role: 'assistant', content: '答案', thinking: '分析中...' })]);
    mockSave.mockResolvedValue('/tmp/test.docx');
    await exportAsDocx('c1');
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('handles messages with code blocks', async () => {
    setupMocks([makeMsg({ role: 'assistant', content: '```javascript\nconsole.log("hi");\n```' })]);
    mockSave.mockResolvedValue('/tmp/test.docx');
    await exportAsDocx('c1');
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('handles messages with RAG citations', async () => {
    const ragResults = JSON.stringify([
      { chunk_id: 1, document_id: 'd1', content: '内容', position: 0, distance: 0.2, document_name: '文档A', document_type: 'pdf' },
    ]);
    setupMocks([makeMsg({ role: 'assistant', content: '回答', rag_results: ragResults })]);
    mockSave.mockResolvedValue('/tmp/test.docx');
    await exportAsDocx('c1');
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('handles messages with markdown tables', async () => {
    const content = '| 列A | 列B |\n| --- | --- |\n| 1 | 2 |';
    setupMocks([makeMsg({ role: 'assistant', content })]);
    mockSave.mockResolvedValue('/tmp/test.docx');
    await exportAsDocx('c1');
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('handles messages with ordered and unordered lists', async () => {
    const content = '- 项目一\n- 项目二\n\n1. 第一\n2. 第二';
    setupMocks([makeMsg({ role: 'assistant', content })]);
    mockSave.mockResolvedValue('/tmp/test.docx');
    await exportAsDocx('c1');
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('handles messages with blockquotes', async () => {
    const content = '> 这是一段引用\n> 第二行';
    setupMocks([makeMsg({ role: 'assistant', content })]);
    mockSave.mockResolvedValue('/tmp/test.docx');
    await exportAsDocx('c1');
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('handles video parts (adds text reference)', async () => {
    const parts = JSON.stringify([
      { type: 'video', path: '/videos/test.mp4', mediaType: 'video/mp4' },
    ]);
    setupMocks([makeMsg({ role: 'assistant', content: '视频已生成', parts })]);
    mockSave.mockResolvedValue('/tmp/test.docx');
    await exportAsDocx('c1');
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('handles file attachments', async () => {
    const msgs = [makeMsg({
      attachments: [
        { id: 'a1', type: 'file', name: '数据.csv', path: '/att/数据.csv' },
      ],
    })];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.docx');
    await exportAsDocx('c1');
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('handles image attachments', async () => {
    mockReadFile.mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47])); // PNG header
    const msgs = [makeMsg({
      role: 'assistant',
      content: '看图',
      parts: JSON.stringify([
        { type: 'image', path: '/gen/img.png', mediaType: 'image/png', width: 800, height: 600 },
      ]),
    })];
    setupMocks(msgs);
    mockSave.mockResolvedValue('/tmp/test.docx');
    await exportAsDocx('c1');
    expect(mockWriteFile).toHaveBeenCalled();
  });
});
