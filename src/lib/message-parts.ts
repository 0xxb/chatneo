// src/lib/message-parts.ts

export interface TextPart {
  type: 'text';
  content: string;
}

export interface ImagePart {
  type: 'image';
  path: string;
  mediaType: string;
  width?: number;
  height?: number;
  revisedPrompt?: string;
}

export interface VideoPart {
  type: 'video';
  path: string;
  mediaType: string;
  duration?: number;
}

export interface AudioPart {
  type: 'audio';
  path: string;
  mediaType: string;
  duration?: number;
}

export type MessagePart = TextPart | ImagePart | VideoPart | AudioPart;

export const MEDIA_PART_TYPES = new Set(['text', 'image', 'video', 'audio']);

/** Parse the `parts` JSON string from MessageRow. Returns empty array if not media parts. */
export function parseMessageParts(partsJson: string): MessagePart[] {
  if (!partsJson) return [];
  try {
    const parsed = JSON.parse(partsJson);
    if (Array.isArray(parsed) && parsed.length > 0 && MEDIA_PART_TYPES.has(parsed[0].type)) {
      return parsed as MessagePart[];
    }
  } catch { /* not valid JSON */ }
  return [];
}

/** Extract file paths from media parts (image/video/audio). Used for cleanup. */
export function getPartsMediaPaths(partsJson: string | null | undefined): string[] {
  if (!partsJson) return [];
  return parseMessageParts(partsJson)
    .filter((p): p is Exclude<MessagePart, TextPart> => p.type !== 'text')
    .map((p) => p.path);
}
