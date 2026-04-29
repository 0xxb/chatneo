import { useChatStore } from '../store/chat';
import type { MessageRow } from '../store/chat';
import { resolveImageDataUrl } from './attachments';
import { generateImageChat, generateVideoChat } from './chat';
import type { MessagePart } from './message-parts';
import { getImageSettings } from './providers/get-image-settings';
import { logger } from './logger';
import i18n from '../locales';
import { formatErrorDetail, persistErrorMessage, persistAssistantMessage } from './chat-persistence';

function mediaOnFinish(convId: string, streamingMsgId: string) {
  return async (parts: MessagePart[], i18nKey: string) => {
    if (!useChatStore.getState().streamingMap.has(convId)) return;
    await persistAssistantMessage({
      convId, messageId: streamingMsgId,
      content: i18n.t(i18nKey, { count: parts.length }),
      partsJson: JSON.stringify(parts),
    });
  };
}

function mediaOnError(convId: string, logLabel: string) {
  return (error: Error) => {
    useChatStore.getState().setStreaming(convId, null);
    logger.error('chat', `${logLabel}: convId=${convId}, error=${error.message}`);
    persistErrorMessage(convId, formatErrorDetail(error));
  };
}

export async function runImageStrategy(opts: {
  convId: string;
  providerId: number;
  modelId: string;
  streamingMsgId: string;
  abortController: AbortController;
  lastUserRow: MessageRow | undefined;
  seed: number | null | undefined;
}): Promise<void> {
  const { convId, providerId, modelId, streamingMsgId, abortController, lastUserRow } = opts;
  const seed = opts.seed ?? undefined;

  const currentStream = useChatStore.getState().streamingMap.get(convId);
  if (currentStream && !('type' in currentStream)) {
    useChatStore.getState().setStreaming(convId, {
      ...currentStream, mediaType: 'image', mediaStartTime: Date.now(),
    });
  }

  const imgSettings = await getImageSettings(providerId, modelId);
  const userImageAtts = lastUserRow?.attachments?.filter((a) => a.type === 'image') ?? [];
  const imageDataUrls = userImageAtts.length > 0
    ? await Promise.all(userImageAtts.map((att) => resolveImageDataUrl(att)))
    : undefined;

  const onFinish = mediaOnFinish(convId, streamingMsgId);
  await generateImageChat({
    providerId, modelId,
    prompt: lastUserRow?.content ?? '',
    imageDataUrls,
    abortSignal: abortController.signal,
    size: imgSettings.size,
    aspectRatio: imgSettings.aspectRatio,
    n: imgSettings.n,
    seed,
    onFinish: (parts) => onFinish(parts, 'chat.generatedImages'),
    onError: mediaOnError(convId, '图片生成失败'),
  });
}

export async function runVideoStrategy(opts: {
  convId: string;
  providerId: number;
  modelId: string;
  streamingMsgId: string;
  abortController: AbortController;
  lastUserRow: MessageRow | undefined;
  seed: number | null | undefined;
}): Promise<void> {
  const { convId, providerId, modelId, streamingMsgId, abortController, lastUserRow } = opts;
  const seed = opts.seed ?? undefined;

  const currentStream = useChatStore.getState().streamingMap.get(convId);
  if (currentStream && !('type' in currentStream)) {
    useChatStore.getState().setStreaming(convId, {
      ...currentStream, mediaType: 'video', mediaStartTime: Date.now(),
    });
  }

  const lastUserImageAtts = lastUserRow?.attachments?.filter((a) => a.type === 'image') ?? [];
  const imageDataUrl = lastUserImageAtts.length > 0
    ? await resolveImageDataUrl(lastUserImageAtts[0])
    : undefined;

  const onFinish = mediaOnFinish(convId, streamingMsgId);
  await generateVideoChat({
    providerId, modelId,
    prompt: lastUserRow?.content ?? '',
    imageDataUrl,
    abortSignal: abortController.signal,
    seed,
    onFinish: (parts) => onFinish(parts, 'chat.generatedVideos'),
    onError: mediaOnError(convId, '视频生成失败'),
  });
}
