import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(inputs.filter(Boolean).join(' '));
}

/** Split "deepseek-r1:8b" into { base: "deepseek-r1", variant: "8b" }. */
export function splitModelName(name: string): { base: string; variant?: string } {
  const idx = name.indexOf(':');
  if (idx === -1) return { base: name };
  return { base: name.slice(0, idx), variant: name.slice(idx + 1) };
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Current Unix timestamp in seconds. */
export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * 判断当前窗口是否为主聊天窗口（存放了 `data-chat-window` 标记）。
 * 该属性在 `index.html` 的 `<html>` 标签上静态声明，保证模块加载期即可读。
 */
export function isChatWindow(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.hasAttribute('data-chat-window');
}

/** Placeholder inserted when base64 data is truncated from error messages. */
export const BASE64_OMIT_PLACEHOLDER = '[base64 内容过多，已被 ChatNeo 省略]';

/** Truncate base64 data embedded in error messages to keep the UI responsive. */
export function sanitizeErrorDetail(detail: string): string {
  return detail.replace(
    /(data:[a-zA-Z0-9+/]+;base64,)[A-Za-z0-9+/=]{200,}/g,
    `$1${BASE64_OMIT_PLACEHOLDER}`,
  ).replace(
    /("(?:image_url|url|image|data|content)":\s*"?)([A-Za-z0-9+/=]{200,})/g,
    `$1${BASE64_OMIT_PLACEHOLDER}`,
  );
}
