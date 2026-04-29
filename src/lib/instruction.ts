import { emit } from '@tauri-apps/api/event';
import * as instructionDao from './dao/instruction-dao';
import { logger } from './logger';

export type Instruction = instructionDao.InstructionRow;

// ─── Instruction CRUD ─────────────────────────────────────────────────────────

export async function listInstructions(): Promise<Instruction[]> {
  return instructionDao.listInstructions();
}

export async function createInstruction(data: {
  title: string;
  content?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await instructionDao.insertInstruction(id, data.title, data.content ?? '');
  emit('instructions-changed').catch((e) => { logger.warn('instruction', `emit instructions-changed 失败: ${e}`); });
  return id;
}

export async function updateInstruction(
  id: string,
  updates: Partial<Pick<Instruction, 'title' | 'content' | 'enabled' | 'sort_order'>>,
): Promise<void> {
  await instructionDao.updateInstruction(id, updates);
  emit('instructions-changed').catch((e) => { logger.warn('instruction', `emit instructions-changed 失败: ${e}`); });
}

export async function deleteInstruction(id: string): Promise<void> {
  await instructionDao.deleteInstruction(id);
  emit('instructions-changed').catch((e) => { logger.warn('instruction', `emit instructions-changed 失败: ${e}`); });
}

// ─── Conversation-Instruction Association ─────────────────────────────────────

export async function getConversationInstructions(
  conversationId: string,
): Promise<Instruction[]> {
  return instructionDao.getConversationInstructions(conversationId);
}

export async function setConversationInstructions(
  conversationId: string,
  instructionIds: string[],
): Promise<void> {
  await instructionDao.setConversationInstructions(conversationId, instructionIds);
}

export async function getConversationInstructionIds(
  conversationId: string,
): Promise<string[]> {
  return instructionDao.getConversationInstructionIds(conversationId);
}
