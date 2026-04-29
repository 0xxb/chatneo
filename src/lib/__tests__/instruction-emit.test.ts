import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsertInstruction = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockUpdateInstruction = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockDeleteInstruction = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockEmit = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock('../dao/instruction-dao', () => ({
  insertInstruction: (...args: unknown[]) => mockInsertInstruction(...args),
  updateInstruction: (...args: unknown[]) => mockUpdateInstruction(...args),
  deleteInstruction: (...args: unknown[]) => mockDeleteInstruction(...args),
  listInstructions: vi.fn().mockResolvedValue([]),
  getConversationInstructions: vi.fn().mockResolvedValue([]),
  setConversationInstructions: vi.fn().mockResolvedValue(undefined),
  getConversationInstructionIds: vi.fn().mockResolvedValue([]),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}));
vi.mock('../logger', () => ({
  logger: { warn: (...args: unknown[]) => mockLoggerWarn(...args), info: vi.fn(), error: vi.fn() },
}));

import { createInstruction, updateInstruction, deleteInstruction } from '../instruction';

describe('instruction — emit failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createInstruction logs warning when emit fails', async () => {
    mockEmit.mockReturnValueOnce(Promise.reject(new Error('emit fail')));
    const id = await createInstruction({ title: '测试' });
    expect(id).toBeTruthy();
    // Wait for the fire-and-forget promise to settle
    await vi.waitFor(() => {
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'instruction',
        expect.stringContaining('emit instructions-changed 失败'),
      );
    });
  });

  it('updateInstruction logs warning when emit fails', async () => {
    mockEmit.mockReturnValueOnce(Promise.reject(new Error('emit fail')));
    await updateInstruction('i1', { title: '新' });
    await vi.waitFor(() => {
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'instruction',
        expect.stringContaining('emit instructions-changed 失败'),
      );
    });
  });

  it('deleteInstruction logs warning when emit fails', async () => {
    mockEmit.mockReturnValueOnce(Promise.reject(new Error('emit fail')));
    await deleteInstruction('i1');
    await vi.waitFor(() => {
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'instruction',
        expect.stringContaining('emit instructions-changed 失败'),
      );
    });
  });
});
