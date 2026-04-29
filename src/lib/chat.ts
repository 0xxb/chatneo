import { streamText, generateText, stepCountIs, type ModelMessage, type Tool, type ToolCallPart, type ToolResultPart } from 'ai';
import { createModel, resolveProvider } from './providers';
import { buildThinkingOptions, type ThinkingLevel } from './model-capabilities';
import { readFile } from '@tauri-apps/plugin-fs';
import { resolveImageDataUrl, guessMediaType } from './attachments';
import type { MessageRow } from '../store/chat';
import type { ToolCallData } from './tool-call-types';
import type { TokenUsage } from './types/chat-message';
import { logger, logApiRequest } from './logger';
import { MEDIA_PART_TYPES } from './message-parts';

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(stringifyError(err));
}

function buildTokenUsage(rawUsage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }, duration: number): TokenUsage {
  return { inputTokens: rawUsage.inputTokens ?? 0, outputTokens: rawUsage.outputTokens ?? 0, totalTokens: rawUsage.totalTokens ?? 0, duration };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolSet = Record<string, AnyTool>;

/** Convert MessageRow[] to ModelMessage[] for the AI SDK, resolving image attachments. */
export async function buildModelMessages(
  rows: MessageRow[],
  summary?: { content: string; compressed_count: number },
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = [];
  if (summary && summary.compressed_count > 0) {
    messages.push({ role: 'system', content: `以下是之前对话的摘要：\n${summary.content}` } as ModelMessage);
  }
  const skipCount = summary ? Math.min(summary.compressed_count, rows.length) : 0;
  const effectiveRows = rows.slice(skipCount);
  for (const m of effectiveRows) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;

    // If assistant message has parts (tool calls), reconstruct multi-part message
    if (m.role === 'assistant' && m.parts) {
      try {
        const parts: ToolCallData[] = JSON.parse(m.parts);
        if (Array.isArray(parts) && parts.length > 0 && !MEDIA_PART_TYPES.has((parts[0] as unknown as Record<string, unknown>).type as string)) {
          // Build assistant message with tool call parts
          const assistantContent: Array<{ type: 'text'; text: string } | ToolCallPart> = [];
          const toolResults: ToolResultPart[] = [];

          if (m.content) {
            assistantContent.push({ type: 'text', text: m.content });
          }
          for (const tc of parts) {
            assistantContent.push({
              type: 'tool-call',
              toolCallId: tc.id,
              toolName: tc.toolName,
              input: tc.args,
            } as ToolCallPart);
            if (tc.state === 'result' || tc.state === 'error') {
              let output: unknown;
              if (tc.state === 'error') {
                output = { type: 'error-text', value: tc.error ?? 'Tool call failed' };
              } else if (typeof tc.result === 'string') {
                output = { type: 'text', value: tc.result };
              } else {
                output = { type: 'json', value: tc.result ?? {} };
              }
              toolResults.push({
                type: 'tool-result',
                toolCallId: tc.id,
                toolName: tc.toolName,
                output,
              } as ToolResultPart);
            }
          }

          messages.push({ role: 'assistant', content: assistantContent } as ModelMessage);
          if (toolResults.length > 0) {
            messages.push({ role: 'tool', content: toolResults } as unknown as ModelMessage);
          }
          continue;
        }
      } catch { /* not valid JSON, fall through to plain text */ }
    }

    const imageAtts = m.attachments?.filter((a) => a.type === 'image') ?? [];
    const fileAtts = m.attachments?.filter((a) => a.type === 'file') ?? [];
    if (m.role === 'user' && (imageAtts.length > 0 || fileAtts.length > 0)) {
      const parts: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; image: string }
        | { type: 'file'; data: Uint8Array; mediaType: string; filename: string }
      > = [];
      if (m.content) parts.push({ type: 'text', text: m.content });
      const [imageParts, fileParts] = await Promise.all([
        Promise.all(imageAtts.map(async (att) => {
          const dataUrl = await resolveImageDataUrl(att);
          const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/s);
          if (match) {
            return { type: 'image' as const, image: match[2], mediaType: match[1] };
          }
          return { type: 'image' as const, image: dataUrl };
        })),
        Promise.all(fileAtts.map(async (att) => ({
          type: 'file' as const, data: await readFile(att.path), mediaType: guessMediaType(att.name), filename: att.name,
        }))),
      ]);
      parts.push(...imageParts, ...fileParts);
      messages.push({ role: 'user', content: parts });
    } else if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content });
    } else {
      messages.push({ role: 'assistant', content: m.content });
    }
  }
  return messages;
}

interface BaseChatParams {
  providerId: number;
  modelId: string;
  messages: ModelMessage[];
  abortSignal?: AbortSignal;
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  seed?: number;
  maxRetries?: number;
  timeout?: number;
  customHeaders?: Record<string, string>;
}

function buildModelOptions(p: BaseChatParams) {
  return {
    ...(p.temperature !== undefined ? { temperature: p.temperature } : {}),
    ...(p.maxOutputTokens !== undefined ? { maxTokens: p.maxOutputTokens } : {}),
    ...(p.topP !== undefined ? { topP: p.topP } : {}),
    ...(p.topK !== undefined ? { topK: p.topK } : {}),
    ...(p.frequencyPenalty !== undefined ? { frequencyPenalty: p.frequencyPenalty } : {}),
    ...(p.presencePenalty !== undefined ? { presencePenalty: p.presencePenalty } : {}),
    ...(p.stopSequences?.length ? { stopSequences: p.stopSequences } : {}),
    ...(p.seed !== undefined ? { seed: p.seed } : {}),
    ...(p.maxRetries !== undefined ? { maxRetries: p.maxRetries } : {}),
    timeout: { totalMs: p.timeout ?? 300000 },
    ...(p.customHeaders ? { headers: p.customHeaders } : {}),
  };
}

export interface StreamChatParams extends BaseChatParams {
  tools?: ToolSet;
  maxSteps?: number;
  onChunk: (fullText: string) => void;
  onThinkingChunk?: (fullThinking: string) => void;
  onToolCallChunk?: (toolCalls: ToolCallData[]) => void;
  onFinish: (fullText: string, thinking?: string, toolCalls?: ToolCallData[], usage?: TokenUsage) => void | Promise<void>;
  onError: (error: Error) => void;
}

export async function streamChat(params: StreamChatParams): Promise<void> {
  const { providerId, modelId, messages, abortSignal, thinkingLevel, tools, maxSteps, onChunk, onThinkingChunk, onToolCallChunk, onFinish, onError } = params;
  const startTime = Date.now();
  let providerType = 'unknown';
  try {
    const resolved = await resolveProvider(providerId);
    if (!resolved) {
      onError(new Error('未配置服务商'));
      return;
    }
    providerType = resolved.providerType;
    logger.info('chat', `流式请求开始: provider=${providerType}, model=${modelId}, messages=${messages.length}, thinking=${thinkingLevel ?? 'off'}, tools=${tools ? Object.keys(tools).length : 0}`);

    const model = createModel(resolved.config, modelId);
    const isThinking = thinkingLevel && thinkingLevel !== 'off';
    const providerOptions = buildThinkingOptions(providerType, thinkingLevel ?? 'off');

    let streamError: Error | null = null;

    const result = streamText({
      model,
      messages,
      abortSignal,
      ...buildModelOptions(params),
      ...(providerOptions && Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
      ...(tools ? { tools, toolChoice: 'auto' as const } : {}),
      ...(maxSteps ? { stopWhen: stepCountIs(maxSteps) } : {}),
      onError({ error }) {
        streamError = toError(error);
      },
    });

    const hasTools = !!tools;
    const useFullStream = isThinking || hasTools;

    if (useFullStream) {
      let fullText = '';
      let fullThinking = '';
      const allToolCalls: ToolCallData[] = [];

      for await (const part of result.fullStream) {
        if (part.type === 'reasoning-delta') {
          fullThinking += part.text;
          onThinkingChunk?.(fullThinking);
        } else if (part.type === 'text-delta') {
          fullText += part.text;
          onChunk(fullText);
        } else if (part.type === 'tool-call') {
          const existing = allToolCalls.find((tc) => tc.id === part.toolCallId);
          if (existing) {
            existing.args = part.input as Record<string, unknown>;
          } else {
            allToolCalls.push({
              id: part.toolCallId,
              toolName: part.toolName,
              args: part.input as Record<string, unknown>,
              state: 'calling',
            });
          }
          onToolCallChunk?.([...allToolCalls]);
        } else if (part.type === 'tool-result') {
          const tc = allToolCalls.find((t) => t.id === part.toolCallId);
          if (tc) {
            tc.state = 'result';
            tc.result = part.output;
          }
          onToolCallChunk?.([...allToolCalls]);
        } else if (part.type === 'error') {
          throw toError(part.error);
        }
      }
      if (streamError) throw streamError;
      const duration = Date.now() - startTime;
      const rawUsage = await result.usage;
      const tokenUsage = buildTokenUsage(rawUsage, duration);
      logger.info('chat', `流式请求完成: model=${modelId}, 文本长度=${fullText.length}, thinking长度=${fullThinking.length}, 工具调用=${allToolCalls.length}, 耗时=${duration}ms, tokens=${tokenUsage.totalTokens}`);
      logApiRequest(providerType, modelId, 'success', duration, tokenUsage.totalTokens);
      await onFinish(fullText, fullThinking || undefined, allToolCalls.length > 0 ? allToolCalls : undefined, tokenUsage);
    } else {
      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
        onChunk(fullText);
      }
      if (streamError) throw streamError;
      const duration = Date.now() - startTime;
      const rawUsage = await result.usage;
      const tokenUsage = buildTokenUsage(rawUsage, duration);
      logger.info('chat', `流式请求完成: model=${modelId}, 文本长度=${fullText.length}, 耗时=${duration}ms, tokens=${tokenUsage.totalTokens}`);
      logApiRequest(providerType, modelId, 'success', duration, tokenUsage.totalTokens);
      await onFinish(fullText, undefined, undefined, tokenUsage);
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      const duration = Date.now() - startTime;
      logger.info('chat', `流式请求被用户中止: model=${modelId}, 耗时=${duration}ms`);
      logApiRequest(providerType, modelId, 'cancelled', duration);
      return;
    }
    const duration = Date.now() - startTime;
    logger.error('chat', `流式请求失败: model=${modelId}, error=${stringifyError(err)}, 耗时=${duration}ms`);
    logApiRequest(providerType, modelId, 'error', duration);
    onError(toError(err));
  }
}

export interface NonStreamChatParams extends BaseChatParams {
  onFinish: (fullText: string, thinking?: string, usage?: TokenUsage) => void | Promise<void>;
  onError: (error: Error) => void;
}

export async function nonStreamChat(params: NonStreamChatParams): Promise<void> {
  const { providerId, modelId, messages, abortSignal, thinkingLevel, onFinish, onError } = params;
  const startTime = Date.now();
  let providerType = 'unknown';
  try {
    const resolved = await resolveProvider(providerId);
    if (!resolved) {
      onError(new Error('未配置服务商'));
      return;
    }
    providerType = resolved.providerType;
    logger.info('chat', `非流式请求开始: provider=${providerType}, model=${modelId}, messages=${messages.length}`);

    const model = createModel(resolved.config, modelId);
    const isThinking = thinkingLevel && thinkingLevel !== 'off';
    const providerOptions = buildThinkingOptions(providerType, thinkingLevel ?? 'off');

    const result = await generateText({
      model,
      messages,
      abortSignal,
      ...buildModelOptions(params),
      ...(providerOptions && Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
    });

    const duration = Date.now() - startTime;
    const thinking = isThinking ? result.reasoningText : undefined;
    const tokenUsage = buildTokenUsage(result.usage, duration);
    logger.info('chat', `非流式请求完成: model=${modelId}, 文本长度=${result.text.length}, thinking长度=${thinking?.length ?? 0}, 耗时=${duration}ms, tokens=${tokenUsage.totalTokens}`);
    logApiRequest(providerType, modelId, 'success', duration, tokenUsage.totalTokens);
    await onFinish(result.text, thinking, tokenUsage);
  } catch (err) {
    const duration = Date.now() - startTime;
    if ((err as Error).name === 'AbortError') {
      logger.info('chat', `非流式请求被用户中止: model=${modelId}, 耗时=${duration}ms`);
      logApiRequest(providerType, modelId, 'cancelled', duration);
      return;
    }
    logger.error('chat', `非流式请求失败: model=${modelId}, error=${stringifyError(err)}, 耗时=${duration}ms`);
    logApiRequest(providerType, modelId, 'error', duration);
    onError(toError(err));
  }
}

// Re-export media generation from dedicated module
export { generateImageChat, generateVideoChat } from './media-generation';
export type { GenerateImageParams, GenerateVideoParams } from './media-generation';
