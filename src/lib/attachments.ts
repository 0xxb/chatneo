import { appDataDir, join } from '@tauri-apps/api/path';
import { mkdir, writeFile, readFile, exists, remove, size as statSize } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';

const ATTACHMENTS_DIR = 'attachments';

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  html: 'text/html',
  xml: 'application/xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

/** Extract uppercase file extension from a filename, or 'FILE' if none. */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return 'FILE';
  return parts.pop()!.toUpperCase();
}

/** Guess MIME type from filename extension. */
export function guessMediaType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

function parseMime(dataUrl: string): { mime: string; ext: string } {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,/);
  const mime = match?.[1] ?? 'image/png';
  const ext = Object.entries(EXT_MIME).find(([, m]) => m === mime)?.[0] ?? 'png';
  return { mime, ext };
}

async function ensureDir(): Promise<string> {
  const base = await appDataDir();
  const dir = await join(base, ATTACHMENTS_DIR);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Return the attachments directory path, creating it if needed. */
export const ensureAttachmentsDir = ensureDir;

/** Decode a base64 data URL, write to disk, return the absolute file path. */
export async function saveImageFile(dataUrl: string): Promise<string> {
  const { ext } = parseMime(dataUrl);
  const raw = dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const dir = await ensureDir();
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const filePath = await join(dir, fileName);
  await writeFile(filePath, bytes);
  return filePath;
}

/** Save raw image bytes to disk, return the absolute file path. */
export async function saveMediaFromBytes(bytes: Uint8Array, mediaType: string): Promise<string> {
  const ext = Object.entries(EXT_MIME).find(([, m]) => m === mediaType)?.[0] ?? 'png';
  const dir = await ensureDir();
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const filePath = await join(dir, fileName);
  await writeFile(filePath, bytes);
  return filePath;
}

/** Convert an absolute file path to an asset:// URL for webview rendering. */
export function getAttachmentUrl(filePath: string): string {
  return convertFileSrc(filePath);
}

/** Copy an external file into the attachments directory, return the new path. */
export async function copyFileToAttachments(sourcePath: string): Promise<string> {
  const bytes = await readFile(sourcePath);
  return saveMediaFromBytes(bytes, guessMediaType(sourcePath));
}

/** Delete an attachment file from disk. */
export async function deleteAttachmentFile(filePath: string): Promise<void> {
  try {
    if (await exists(filePath)) await remove(filePath);
  } catch {
    // best-effort cleanup
  }
}

// In-memory LRU cache: file path → data URL (capped to avoid unbounded memory growth)
const DATA_URL_CACHE_MAX = 50;
const dataUrlCache = new Map<string, string>();

function dataUrlCacheSet(key: string, value: string) {
  dataUrlCache.delete(key); // move to end (most recent)
  dataUrlCache.set(key, value);
  if (dataUrlCache.size > DATA_URL_CACHE_MAX) {
    const oldest = dataUrlCache.keys().next().value!;
    dataUrlCache.delete(oldest);
  }
}

/** Pre-populate the cache after saving a file, avoiding a redundant read-back. */
export function cacheImageDataUrl(filePath: string, dataUrl: string): void {
  dataUrlCacheSet(filePath, dataUrl);
}

// Chunked to avoid O(n²) string concatenation and "apply: too many arguments" on large files.
function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const CHUNK_SIZE = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(chunks.join(''));
}

/** Read an image file from disk and return as a base64 data URL (for API calls). */
export async function readImageAsDataUrl(filePath: string): Promise<string> {
  const cached = dataUrlCache.get(filePath);
  if (cached) return cached;

  const bytes = await readFile(filePath);
  const mime = guessMediaType(filePath);
  const result = `data:${mime};base64,${bytesToBase64(bytes)}`;
  dataUrlCacheSet(filePath, result);
  return result;
}

/** Resolve an image attachment to a data URL, using cached preview when available. */
export async function resolveImageDataUrl(att: { preview?: string; path: string }): Promise<string> {
  return att.preview?.startsWith('data:') ? att.preview : readImageAsDataUrl(att.path);
}

/**
 * Read any file as a base64 data URL (used for portable HTML export of videos, etc.).
 * Unlike readImageAsDataUrl, this does not cache (media files can be large).
 * Caller should enforce size limits.
 */
export async function readFileAsDataUrl(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return `data:${guessMediaType(filePath)};base64,${bytesToBase64(bytes)}`;
}

/** Get file size in bytes via stat (no full read), or null if unavailable. */
export async function getFileSize(filePath: string): Promise<number | null> {
  try {
    return await statSize(filePath);
  } catch {
    return null;
  }
}
