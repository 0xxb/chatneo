import { generateText } from 'ai';
import type { OnResponseReceivedContext } from '../../lib/plugin-registry';
import { resolveModelForPlugin } from '../../lib/providers';
import { emit } from '@tauri-apps/api/event';
import { renameConversation } from '../../lib/dao/conversation-dao';

interface TitleConfig {
  trigger: 'disabled' | 'first_message' | 'every_message';
  provider_id: number | null;
  model_id: string;
}

const TITLE_PROMPT =
  '请为以下对话生成一个简短的标题（不超过20个字），直接输出标题文字，不要加引号或其他标点：\n\n';

async function saveTitle(conversationId: string, title: string) {
  await renameConversation(conversationId, title);
  emit('conversation-title-updated', { id: conversationId, title });
}

/**
 * Generate a title for a conversation using AI.
 * Exported for reuse by the context menu action.
 */
export async function generateTitle(
  conversationId: string,
  conversation: { provider_id: number | null; model_id: string },
  messages: { role: string; content: string }[],
  config: TitleConfig,
): Promise<void> {
  const model = await resolveModelForPlugin(config, conversation);
  if (!model) {
    // Fallback: use first user message
    const firstUserMsg = messages.find((m) => m.role === 'user')?.content ?? '';
    await saveTitle(conversationId, firstUserMsg.slice(0, 20) || '新对话');
    return;
  }

  const dialogue = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, 6) // Limit context to keep prompt short
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n');

  const { text } = await generateText({
    model,
    prompt: TITLE_PROMPT + dialogue,
  });

  const title = text.trim().replace(/^["'""'']+|["'""'']+$/g, '').slice(0, 30) || '新对话';
  await saveTitle(conversationId, title);
}

export async function generateTitleHook(
  ctx: OnResponseReceivedContext,
  pluginConfig: Record<string, unknown>,
): Promise<void> {
  const config = pluginConfig as unknown as TitleConfig;
  const { trigger = 'first_message' } = config;

  if (trigger === 'disabled') return;

  if (trigger === 'first_message') {
    const userMessages = ctx.messages.filter((m) => m.role === 'user');
    if (userMessages.length !== 1) return;
  }

  await generateTitle(ctx.conversationId, ctx.conversation, ctx.messages, config);
}
