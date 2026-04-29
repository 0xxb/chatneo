import { generateText } from 'ai';
import type { OnResponseReceivedContext } from '../../lib/plugin-registry';
import { resolveModelForPlugin } from '../../lib/providers';
import { emit } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { safeJsonParse, nowUnix } from '../../lib/utils';
import { logger } from '../../lib/logger';

export interface CompressConfig {
  threshold: number;
  provider_id: number | null;
  model_id: string;
}

interface ConversationSummary {
  content: string;
  compressed_count: number;
  created_at: number;
}

export const KEEP_COUNT = 4;
export const MIN_MESSAGES_FOR_COMPRESS = KEEP_COUNT + 2;

export function parseSummary(json: string | undefined): { content: string; compressed_count: number } | null {
  if (!json) return null;
  const parsed = safeJsonParse<ConversationSummary | null>(json, null);
  if (parsed?.content && parsed.compressed_count > 0) return { content: parsed.content, compressed_count: parsed.compressed_count };
  return null;
}

export function getUncompressedCount(totalMessages: number, summary: string | undefined): number {
  return totalMessages - (parseSummary(summary)?.compressed_count ?? 0);
}

const COMPRESS_PROMPT =
  '请对以下对话历史进行简明扼要的总结，保留关键信息和上下文，以便AI能够基于此摘要继续对话。直接输出摘要内容：\n\n';

async function saveSummary(conversationId: string, summary: ConversationSummary) {
  const { getDb } = await import('../../lib/db');
  const db = await getDb();
  await db.execute(
    'UPDATE conversations SET summary = $1 WHERE id = $2',
    [JSON.stringify(summary), conversationId],
  );
  emit('conversation-summary-updated', { id: conversationId, summary });
}

export async function compressContext(
  conversationId: string,
  conversation: { provider_id: number | null; model_id: string; summary?: string },
  messages: { role: string; content: string }[],
  config: CompressConfig,
): Promise<void> {
  const model = await resolveModelForPlugin(config, conversation);
  if (!model) {
    toast.error('无法压缩：未找到可用模型');
    return;
  }

  const existing = parseSummary(conversation.summary);
  const alreadyCompressed = existing?.compressed_count ?? 0;
  const uncompressed = messages.slice(alreadyCompressed);

  if (uncompressed.length < MIN_MESSAGES_FOR_COMPRESS) return;
  const toCompress = uncompressed.slice(0, uncompressed.length - KEEP_COUNT);

  let dialogue = '';
  if (existing) {
    dialogue += `[之前的对话摘要]\n${existing.content}\n\n[后续对话]\n`;
  }
  dialogue += toCompress
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n');

  toast.loading('正在压缩上下文...', { id: 'compressing' });

  try {
    const { text } = await generateText({
      model,
      prompt: COMPRESS_PROMPT + dialogue,
    });

    const newCompressedCount = alreadyCompressed + toCompress.length;
    const summary: ConversationSummary = {
      content: text.trim(),
      compressed_count: newCompressedCount,
      created_at: nowUnix(),
    };

    await saveSummary(conversationId, summary);
    toast.success(`已压缩 ${toCompress.length} 条消息`, { id: 'compressing' });
  } catch (e) {
    toast.error(`压缩失败: ${(e as Error).message}`, { id: 'compressing' });
    throw e;
  }
}

export async function compressContextHook(
  ctx: OnResponseReceivedContext,
  pluginConfig: Record<string, unknown>,
): Promise<void> {
  const config = pluginConfig as unknown as CompressConfig;

  const chatMessages = ctx.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const uncompressedCount = getUncompressedCount(chatMessages.length, ctx.conversation.summary);
  if (uncompressedCount < config.threshold) return;

  const doCompress = () => {
    toast.dismiss('compress-suggest');
    compressContext(
      ctx.conversationId,
      ctx.conversation,
      chatMessages,
      config,
    ).catch((e) => logger.warn('plugin', `压缩上下文失败: ${e}`));
  };

  toast.custom(
    () => (
      <div className="flex items-center justify-between gap-3 w-[356px] px-4 py-3 rounded-lg text-[13px] bg-(--color-bg-dialog) text-(--color-label) shadow-lg border border-(--color-separator)">
        <div>
          <div className="font-medium">对话较长，建议压缩上下文</div>
          <div className="text-xs opacity-70 mt-0.5">当前已有 {uncompressedCount} 条未压缩消息</div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            className="px-3 py-1 rounded-md text-xs cursor-pointer border-none bg-(--color-accent) text-white"
            onClick={(e) => { e.stopPropagation(); doCompress(); }}
          >
            压缩
          </button>
          <button
            className="px-2 py-1 rounded-md text-xs cursor-pointer border-none bg-transparent opacity-50"
            onClick={(e) => { e.stopPropagation(); toast.dismiss('compress-suggest'); }}
          >
            ✕
          </button>
        </div>
      </div>
    ),
    { id: 'compress-suggest', duration: Infinity },
  );
}
