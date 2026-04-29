import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsertInstruction = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockUpdateInstruction = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockDeleteInstruction = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockListInstructions = vi.fn().mockResolvedValue([]);
const mockGetConversationInstructions = vi.fn().mockResolvedValue([]);
const mockSetConversationInstructions = vi.fn().mockResolvedValue(undefined);
const mockGetConversationInstructionIds = vi.fn().mockResolvedValue([]);
const mockEmit = vi.fn().mockResolvedValue(undefined);

vi.mock('../dao/instruction-dao', () => ({
  insertInstruction: (...args: unknown[]) => mockInsertInstruction(...args),
  updateInstruction: (...args: unknown[]) => mockUpdateInstruction(...args),
  deleteInstruction: (...args: unknown[]) => mockDeleteInstruction(...args),
  listInstructions: () => mockListInstructions(),
  getConversationInstructions: (...args: unknown[]) => mockGetConversationInstructions(...args),
  setConversationInstructions: (...args: unknown[]) => mockSetConversationInstructions(...args),
  getConversationInstructionIds: (...args: unknown[]) => mockGetConversationInstructionIds(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  listInstructions,
  createInstruction,
  updateInstruction,
  deleteInstruction,
  getConversationInstructions,
  setConversationInstructions,
  getConversationInstructionIds,
} from '../instruction';

describe('instruction.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listInstructions delegates to DAO', async () => {
    const data = [{ id: 'i1', title: '测试', content: '', enabled: 1, sort_order: 0, created_at: 1000 }];
    mockListInstructions.mockResolvedValueOnce(data);
    const result = await listInstructions();
    expect(result).toEqual(data);
  });

  it('createInstruction generates UUID and calls DAO', async () => {
    const id = await createInstruction({ title: '新指令', content: '内容' });
    expect(id).toBeTruthy();
    expect(id.length).toBe(36); // UUID format
    expect(mockInsertInstruction).toHaveBeenCalledWith(id, '新指令', '内容');
    expect(mockEmit).toHaveBeenCalledWith('instructions-changed');
  });

  it('createInstruction defaults content to empty string', async () => {
    await createInstruction({ title: '无内容' });
    expect(mockInsertInstruction).toHaveBeenCalledWith(expect.any(String), '无内容', '');
  });

  it('updateInstruction calls DAO and emits event', async () => {
    await updateInstruction('i1', { title: '新标题', content: '新内容' });
    expect(mockUpdateInstruction).toHaveBeenCalledWith('i1', { title: '新标题', content: '新内容' });
    expect(mockEmit).toHaveBeenCalledWith('instructions-changed');
  });

  it('deleteInstruction calls DAO and emits event', async () => {
    await deleteInstruction('i1');
    expect(mockDeleteInstruction).toHaveBeenCalledWith('i1');
    expect(mockEmit).toHaveBeenCalledWith('instructions-changed');
  });

  it('getConversationInstructions delegates to DAO', async () => {
    const data = [{ id: 'i1', title: '关联指令', content: '', enabled: 1, sort_order: 0, created_at: 1000 }];
    mockGetConversationInstructions.mockResolvedValueOnce(data);
    const result = await getConversationInstructions('conv1');
    expect(result).toEqual(data);
    expect(mockGetConversationInstructions).toHaveBeenCalledWith('conv1');
  });

  it('setConversationInstructions delegates to DAO', async () => {
    await setConversationInstructions('conv1', ['i1', 'i2']);
    expect(mockSetConversationInstructions).toHaveBeenCalledWith('conv1', ['i1', 'i2']);
  });

  it('getConversationInstructionIds delegates to DAO', async () => {
    mockGetConversationInstructionIds.mockResolvedValueOnce(['i1', 'i2']);
    const result = await getConversationInstructionIds('conv1');
    expect(result).toEqual(['i1', 'i2']);
  });
});
