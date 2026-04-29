import { generateImage, experimental_generateVideo as generateVideo } from 'ai';
import { createImageModel, createVideoModel, resolveProvider } from './providers';
import { guessMediaType, saveMediaFromBytes, deleteAttachmentFile } from './attachments';
import { readFile } from '@tauri-apps/plugin-fs';
import type { ImagePart, VideoPart, MessagePart } from './message-parts';
import { logger, logApiRequest } from './logger';
import { invoke } from '@tauri-apps/api/core';

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(stringifyError(err));
}

export interface GenerateImageParams {
  providerId: number;
  modelId: string;
  prompt: string;
  abortSignal?: AbortSignal;
  size?: string;
  aspectRatio?: string;
  n?: number;
  seed?: number;
  imageDataUrls?: string[];
  onFinish: (parts: MessagePart[]) => void | Promise<void>;
  onError: (error: Error) => void;
}

export async function generateImageChat(params: GenerateImageParams): Promise<void> {
  const { providerId, modelId, prompt, abortSignal, size, aspectRatio, n, seed, imageDataUrls, onFinish, onError } = params;
  const startTime = Date.now();
  let providerType = 'unknown';
  try {
    const resolved = await resolveProvider(providerId);
    if (!resolved) {
      onError(new Error('未配置服务商'));
      return;
    }
    providerType = resolved.providerType;
    logger.info('chat', `图片生成开始: provider=${providerType}, model=${modelId}, prompt="${prompt.slice(0, 100)}", size=${size ?? '-'}, n=${n ?? 1}`);

    const model = createImageModel(resolved.config, modelId);

    const imgProviderOptions = imageDataUrls?.length
      ? { openai: { image: imageDataUrls.length === 1 ? imageDataUrls[0] : imageDataUrls } }
      : undefined;

    const result = await generateImage({
      model,
      prompt,
      abortSignal,
      ...(size ? { size: size as `${number}x${number}` } : {}),
      ...(aspectRatio ? { aspectRatio: aspectRatio as `${number}:${number}` } : {}),
      ...(n !== undefined ? { n } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(imgProviderOptions ? { providerOptions: imgProviderOptions } : {}),
    });

    const parts: MessagePart[] = await Promise.all(
      result.images.map(async (img) => {
        const filePath = await saveMediaFromBytes(img.uint8Array, img.mediaType ?? 'image/png');
        return {
          type: 'image',
          path: filePath,
          mediaType: img.mediaType ?? 'image/png',
        } satisfies ImagePart;
      }),
    );

    if (parts.length === 0) {
      onError(new Error('未生成任何图片'));
      return;
    }

    const duration = Date.now() - startTime;
    logger.info('chat', `图片生成完成: model=${modelId}, 图片数=${parts.length}, 耗时=${duration}ms`);
    logApiRequest(providerType, modelId, 'success', duration);
    await onFinish(parts);
  } catch (err) {
    const duration = Date.now() - startTime;
    if ((err as Error).name === 'AbortError') {
      logger.info('chat', `图片生成被用户中止: model=${modelId}, 耗时=${duration}ms`);
      return;
    }
    logger.error('chat', `图片生成失败: model=${modelId}, error=${stringifyError(err)}, 耗时=${duration}ms`);
    logApiRequest(providerType, modelId, 'error', duration);
    onError(toError(err));
  }
}

export interface GenerateVideoParams {
  providerId: number;
  modelId: string;
  prompt: string;
  abortSignal?: AbortSignal;
  aspectRatio?: string;
  duration?: number;
  seed?: number;
  imageDataUrl?: string;
  onFinish: (parts: MessagePart[]) => void | Promise<void>;
  onError: (error: Error) => void;
}

export async function generateVideoChat(params: GenerateVideoParams): Promise<void> {
  const { providerId, modelId, prompt, abortSignal, aspectRatio, duration, seed, imageDataUrl, onFinish, onError } = params;
  const startTime = Date.now();
  let providerType = 'unknown';
  const downloadedPaths: string[] = [];
  try {
    const resolved = await resolveProvider(providerId);
    if (!resolved) {
      onError(new Error('未配置服务商'));
      return;
    }
    providerType = resolved.providerType;
    logger.info('chat', `视频生成开始: provider=${providerType}, model=${modelId}, prompt="${prompt.slice(0, 100)}"`);

    const model = createVideoModel(resolved.config, modelId);

    const videoPrompt = imageDataUrl
      ? { image: imageDataUrl, text: prompt }
      : prompt;
    const result = await generateVideo({
      model,
      prompt: videoPrompt,
      abortSignal,
      ...(aspectRatio ? { aspectRatio: aspectRatio as `${number}:${number}` } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(seed !== undefined ? { seed } : {}),
      download: async ({ url }) => {
        const ext = url.pathname.split('.').pop() ?? 'mp4';
        const filePath = await invoke<string>('download_file', { url: url.toString(), ext });
        downloadedPaths.push(filePath);
        const bytes = await readFile(filePath);
        const mediaType = guessMediaType(ext) ?? 'video/mp4';
        return { data: bytes, mediaType };
      },
    });

    const parts: MessagePart[] = result.videos.map((video, i) => {
      const mediaType = video.mediaType ?? 'video/mp4';
      return { type: 'video', path: downloadedPaths[i], mediaType } satisfies VideoPart;
    });

    if (parts.length === 0) {
      onError(new Error('未生成任何视频'));
      return;
    }

    const elapsedMs = Date.now() - startTime;
    logger.info('chat', `视频生成完成: model=${modelId}, 视频数=${parts.length}, 耗时=${elapsedMs}ms`);
    logApiRequest(providerType, modelId, 'success', elapsedMs);
    await onFinish(parts);
  } catch (err) {
    // Clean up any downloaded files on failure
    for (const p of downloadedPaths) {
      deleteAttachmentFile(p).catch(() => {});
    }
    const elapsedMs = Date.now() - startTime;
    if ((err as Error).name === 'AbortError') {
      logger.info('chat', `视频生成被用户中止: model=${modelId}, 耗时=${elapsedMs}ms`);
      return;
    }
    logger.error('chat', `视频生成失败: model=${modelId}, error=${stringifyError(err)}, 耗时=${elapsedMs}ms`);
    logApiRequest(providerType, modelId, 'error', elapsedMs);
    onError(toError(err));
  }
}
