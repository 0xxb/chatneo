import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { basename } from '@tauri-apps/api/path';
import { marked, type Tokens } from 'marked';
import hljs from 'highlight.js';
import { getDb } from '../lib/db';
import type { MessageRow } from '../store/chat';
import type { Attachment } from '../components/MessageInput/types';
import { getMessages } from '../lib/dao/message-dao';
import { getAttachmentsByConversation } from '../lib/dao/attachment-dao';
import { getProviderById } from '../lib/dao/provider-dao';
import { parseMessageParts, type ImagePart, type VideoPart } from '../lib/message-parts';
import { readImageAsDataUrl, readFileAsDataUrl, getFileSize } from '../lib/attachments';
import { logger } from '../lib/logger';
import { safeJsonParse } from '../lib/utils';
import type { SearchResult } from '../lib/knowledge-base';
import { getSettingValue, PRESET_BACKGROUNDS } from '../lib/apply-settings';

import hljsCss from 'highlight.js/styles/github.min.css?raw';

/** 超过此阈值的视频不内嵌为 data URI，改为占位说明，避免 HTML 文件过大。 */
const MAX_EMBED_VIDEO_BYTES = 30 * 1024 * 1024;

export interface ConversationData {
  title: string;
  model: string;
  messages: MessageRow[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const ROLE_LABELS: Record<string, string> = { user: '用户', assistant: '助手', error: '错误' };
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

// LLM 输出可能包含原始 HTML，转义以防 XSS
marked.use({
  renderer: {
    html({ text }: { text: string }) { return escapeHtml(text); },
    code({ lang, text }: Tokens.Code) {
      const highlighted = lang && hljs.getLanguage(lang)
        ? hljs.highlight(text, { language: lang }).value
        : hljs.highlightAuto(text).value;
      const label = lang ? `<div class="code-lang">${escapeHtml(lang)}</div>` : '';
      return `<div class="code-block">${label}<pre><code class="hljs">${highlighted}</code></pre></div>`;
    },
  },
});

export async function fetchConversationData(conversationId: string): Promise<ConversationData> {
  const db = await getDb();
  const [conv] = await db.select<{ title: string; provider_id: number | null; model_id: string }[]>(
    'SELECT title, provider_id, model_id FROM conversations WHERE id = $1',
    [conversationId],
  );
  if (!conv) throw new Error('会话不存在');

  const messages = await getMessages(conversationId);

  // 加载附件
  const attRows = await getAttachmentsByConversation(conversationId);
  if (attRows.length) {
    const attMap = new Map<string, Attachment[]>();
    for (const row of attRows) {
      const list = attMap.get(row.message_id) ?? [];
      list.push({ id: row.id, type: row.type as 'image' | 'file', name: row.name, path: row.path });
      attMap.set(row.message_id, list);
    }
    for (const msg of messages) {
      const atts = attMap.get(msg.id);
      if (atts) msg.attachments = atts;
    }
  }

  let model = conv.model_id;
  if (conv.provider_id != null) {
    const provider = await getProviderById(conv.provider_id);
    if (provider) model = `${provider.name} / ${conv.model_id}`;
  }

  return { title: conv.title, model, messages };
}

export function getImageParts(msg: MessageRow): ImagePart[] {
  const parts = parseMessageParts(msg.parts);
  return parts.filter((p): p is ImagePart => p.type === 'image');
}

export function getVideoParts(msg: MessageRow): VideoPart[] {
  const parts = parseMessageParts(msg.parts);
  return parts.filter((p): p is VideoPart => p.type === 'video');
}

// --- Markdown Export ---

export async function exportAsMarkdown(conversationId: string) {
  logger.info('export', `导出 Markdown: convId=${conversationId}`);
  const { title, model, messages } = await fetchConversationData(conversationId);

  const lines: string[] = [`# ${title}`, '', `> 模型：${model}`, ''];

  for (const msg of messages) {
    lines.push(`### ${roleLabel(msg.role)}`, '');
    if (msg.thinking) {
      lines.push('<details>', '<summary>思考过程</summary>', '', msg.thinking, '', '</details>', '');
    }
    lines.push(msg.content, '');
    const ragResults = safeJsonParse<SearchResult[]>(msg.rag_results, []);
    if (ragResults.length > 0) {
      lines.push('<details>', '<summary>引用来源</summary>', '');
      for (const r of ragResults) {
        const similarity = Math.max(0, (1 - r.distance) * 100).toFixed(1);
        lines.push(`**${r.document_name}**（相似度 ${similarity}%）`, '', `> ${r.content.replace(/\n/g, '\n> ')}`, '');
      }
      lines.push('</details>', '');
    }
    for (const img of getImageParts(msg)) {
      const alt = escapeHtml(img.revisedPrompt ?? '生成的图片');
      lines.push(`![${alt}](${img.path})`, '');
    }
    for (const vid of getVideoParts(msg)) {
      lines.push(`🎬 [生成的视频](${vid.path})`, '');
    }
    for (const att of msg.attachments ?? []) {
      if (att.type === 'image') {
        lines.push(`![${escapeHtml(att.name)}](${att.path})`, '');
      } else {
        lines.push(`📎 [${escapeHtml(att.name)}](${att.path})`, '');
      }
    }
    lines.push('---', '');
  }

  const path = await save({ defaultPath: `${title}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
  if (path) {
    await writeFile(path, new TextEncoder().encode(lines.join('\n')));
    logger.info('export', `Markdown 导出完成: path=${path}, 消息数=${messages.length}`);
  }
}

// --- HTML/PDF Export ---

const exportCss = `
${hljsCss}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  max-width: 800px; margin: 0 auto; padding: 2rem 1rem;
  line-height: 1.6; color: #1a1a1a; background: #fff;
}
h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
.meta { color: #888; font-size: 0.85rem; margin-bottom: 2rem; }

/* Messages */
.message { margin-bottom: 1.25rem; }
.message.user { display: flex; flex-direction: column; align-items: flex-end; }
.message.user .role { text-align: right; }
.message.user .content {
  background: #007AFF; color: #fff; border-radius: 16px;
  padding: 0.625rem 1rem; max-width: 85%; display: inline-block;
}
.message.user .content code { background: rgba(255,255,255,0.2); color: #fff; }
.message.user .content a { color: #fff; text-decoration: underline; }
.message.user .content h1, .message.user .content h2,
.message.user .content h3, .message.user .content h4 { color: #fff; }
.message.assistant .content { padding: 0.5rem 0; }
.message.error .content {
  background: #fef2f2; border-radius: 12px; padding: 0.625rem 1rem;
  border-left: 3px solid #ef4444; color: #991b1b;
}
.role {
  font-weight: 600; font-size: 0.75rem; text-transform: uppercase;
  letter-spacing: 0.05em; margin-bottom: 0.25rem; opacity: 0.45;
}

/* Content */
.content { overflow-wrap: break-word; }
.content img { max-width: 100%; border-radius: 6px; }
.content p { margin: 0.5em 0; }
.content p:first-child { margin-top: 0; }
.content p:last-child { margin-bottom: 0; }
.content h1, .content h2, .content h3, .content h4 {
  color: #1a1a1a; margin: 1rem 0 0.5rem; font-weight: 600;
}
.content h1 { font-size: 1.25rem; }
.content h2 { font-size: 1.125rem; }
.content h3 { font-size: 1rem; }
.content h4 { font-size: 0.9375rem; }
.content ul, .content ol { margin: 0.5em 0; padding-left: 1.5em; }
.content li { margin: 0.25em 0; }
.content strong { font-weight: 600; }
.content hr { border: none; border-top: 1px solid #e5e7eb; margin: 1rem 0; }

/* Code */
.code-block {
  position: relative; margin: 0.75rem 0; border-radius: 8px;
  border: 1px solid #e5e7eb; overflow: hidden;
}
.code-lang {
  background: #f3f4f6; padding: 0.25rem 0.75rem; font-size: 0.7rem;
  color: #6b7280; font-family: "SF Mono", Menlo, Consolas, monospace;
  border-bottom: 1px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.03em;
}
.code-block pre { margin: 0; border-radius: 0; border: none; }
.code-block pre code.hljs {
  padding: 0.75rem 1rem; font-size: 0.8125rem; line-height: 1.5;
  font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}
code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 0.875em; }
p code, li code {
  background: rgba(0,0,0,0.06); padding: 0.15em 0.35em;
  border-radius: 4px; font-size: 0.8125em;
}

/* Other */
blockquote {
  border-left: 3px solid #d1d5db; margin: 0.75rem 0; margin-left: 0;
  padding-left: 1rem; color: #6b7280;
}
.thinking {
  border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.75rem 1rem;
  margin-bottom: 0.75rem; font-size: 0.875rem; background: #f9fafb;
}
.thinking summary { cursor: pointer; color: #9ca3af; font-weight: 500; }
.generated-images { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
.image-card { width: 200px; flex-shrink: 0; }
.image-card img { width: 100%; height: auto; border-radius: 8px; }
.image-caption {
  margin: 0.25rem 0 0; font-size: 0.7rem; color: #999;
  line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}
.citations {
  border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 0.75rem;
  font-size: 0.8125rem; overflow: hidden;
}
.citations summary {
  cursor: pointer; padding: 0.5rem 0.75rem; color: #6b7280; font-weight: 500;
  background: #f9fafb;
}
.citation-item { padding: 0.5rem 0.75rem; border-top: 1px solid #e5e7eb; }
.citation-item .citation-name { font-weight: 600; color: #374151; }
.citation-item .citation-score { color: #9ca3af; font-size: 0.75rem; margin-left: 0.5rem; }
table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; font-size: 0.875rem; }
th, td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; }
th { background: #f9fafb; font-weight: 600; }
hr { border: none; border-top: 1px solid #f3f4f6; margin: 1.5rem 0; }

@media print {
  body { max-width: none; padding: 0; }
  .message { break-inside: avoid; }
}`;

async function getChatBgCss(): Promise<string> {
  const bgImage = getSettingValue('chat_bg_image');
  if (!bgImage) return '';
  const dimming = parseInt(getSettingValue('chat_bg_dimming') ?? '30', 10) / 100;
  const blur = getSettingValue('chat_bg_blur') ?? '0';

  let bgValue: string;
  if (bgImage.startsWith('preset:')) {
    bgValue = PRESET_BACKGROUNDS[bgImage.slice(7)] ?? '';
    if (!bgValue) return '';
  } else {
    // Custom local image: embed as data URI so exported HTML is portable
    const dataUri = await readImageAsDataUrl(bgImage).catch(() => '');
    if (!dataUri) return '';
    bgValue = `url("${dataUri}") center / cover no-repeat`;
  }

  const overlay = `linear-gradient(rgba(0,0,0,${dimming}),rgba(0,0,0,${dimming}))`;
  return `
    body {
      background: ${overlay}, ${bgValue}; color: rgba(255,255,255,0.9);
      ${parseInt(blur) > 0 ? `backdrop-filter: blur(${blur}px);` : ''}
    }
    body h1, .content h1, .content h2, .content h3, .content h4 { color: rgba(255,255,255,0.9); }
    .meta { color: rgba(255,255,255,0.5); }
    .role { color: rgba(255,255,255,0.5); }
    .message.assistant .content { color: rgba(255,255,255,0.9); }
    .message.user .content { background: rgba(255,255,255,0.8); color: rgba(0,0,0,0.85); }
    .message.user .content code { background: rgba(255,255,255,0.3); }
    p code, li code { background: rgba(255,255,255,0.12); }
    .thinking { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); }
    .thinking summary { color: rgba(255,255,255,0.5); }
    blockquote { border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.6); }
    .code-block { border-color: rgba(255,255,255,0.15); }
    .code-lang { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); border-color: rgba(255,255,255,0.15); }
    th, td { border-color: rgba(255,255,255,0.15); }
    th { background: rgba(255,255,255,0.08); }
    hr { border-color: rgba(255,255,255,0.1); }
    .citations { border-color: rgba(255,255,255,0.15); }
    .citations summary { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); }
    .citation-item { border-color: rgba(255,255,255,0.15); }
    .citation-item .citation-name { color: rgba(255,255,255,0.85); }
    .citation-item .citation-score { color: rgba(255,255,255,0.4); }
    .message.error .content { background: rgba(239,68,68,0.15); border-color: #ef4444; color: #fca5a5; }
  `;
}

async function renderMessageHtml(msg: MessageRow): Promise<string> {
  const thinkingHtml = msg.thinking
    ? `<details open class="thinking"><summary>思考过程</summary>${marked.parse(msg.thinking)}</details>`
    : '';
  const contentHtml = marked.parse(msg.content) as string;
  const [imgCards, attCards, videoCards] = await Promise.all([
    Promise.all(
      getImageParts(msg).map(async (img) => {
        const dataUri = await readImageAsDataUrl(img.path).catch(() => '');
        if (!dataUri) return null;
        const alt = escapeHtml(img.revisedPrompt ?? '生成的图片');
        const caption = img.revisedPrompt
          ? `<p class="image-caption">${escapeHtml(img.revisedPrompt)}</p>`
          : '';
        return `<div class="image-card"><img src="${dataUri}" alt="${alt}" />${caption}</div>`;
      }),
    ),
    Promise.all(
      (msg.attachments ?? []).filter((a) => a.type === 'image').map(async (att) => {
        const dataUri = await readImageAsDataUrl(att.path).catch(() => '');
        if (!dataUri) return null;
        const alt = escapeHtml(att.name);
        return `<div class="image-card"><img src="${dataUri}" alt="${alt}" /><p class="image-caption">${alt}</p></div>`;
      }),
    ),
    Promise.all(
      getVideoParts(msg).map(async (vid) => {
        const size = await getFileSize(vid.path);
        if (size !== null && size <= MAX_EMBED_VIDEO_BYTES) {
          const dataUri = await readFileAsDataUrl(vid.path).catch(() => '');
          if (dataUri) {
            return `<div class="image-card"><video src="${dataUri}" controls style="max-width:100%;border-radius:8px"></video></div>`;
          }
        }
        const name = await basename(vid.path).catch(() => '视频');
        return `<div class="image-card"><p class="image-caption">🎬 视频过大未内嵌：${escapeHtml(name)}</p></div>`;
      }),
    ),
  ]);
  const fileCards = (msg.attachments ?? []).filter((a) => a.type === 'file').map((att) =>
    `<p>📎 ${escapeHtml(att.name)}</p>`
  );
  const allImages = [...imgCards, ...attCards, ...videoCards].filter((t): t is string => t !== null);
  const imagesHtml = allImages.length > 0
    ? `<div class="generated-images">${allImages.join('')}</div>`
    : '';
  const filesHtml = fileCards.join('');
  const ragResults = safeJsonParse<SearchResult[]>(msg.rag_results, []);
  let citationsHtml = '';
  if (ragResults.length > 0) {
    const items = ragResults.map((r) => {
      const similarity = Math.max(0, (1 - r.distance) * 100).toFixed(1);
      return `<div class="citation-item"><span class="citation-name">${escapeHtml(r.document_name)}</span><span class="citation-score">${similarity}%</span></div>`;
    }).join('');
    citationsHtml = `<details open class="citations"><summary>引用来源 (${ragResults.length})</summary>${items}</details>`;
  }
  return `<div class="message ${msg.role}"><div class="role">${roleLabel(msg.role)}</div>${thinkingHtml}<div class="content">${contentHtml}${imagesHtml}${filesHtml}</div>${citationsHtml}</div>`;
}

async function buildHtmlDocument(title: string, model: string, messages: MessageRow[]): Promise<string> {
  const parts = await Promise.all(messages.map(renderMessageHtml));
  const bodyHtml = parts.join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${exportCss}${await getChatBgCss()}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">模型：${escapeHtml(model)}</div>
${bodyHtml}
</body>
</html>`;
}

export async function exportAsHtml(conversationId: string) {
  logger.info('export', `导出 HTML: convId=${conversationId}`);
  const { title, model, messages } = await fetchConversationData(conversationId);
  const html = await buildHtmlDocument(title, model, messages);
  const path = await save({ defaultPath: `${title}.html`, filters: [{ name: 'HTML', extensions: ['html'] }] });
  if (path) {
    await writeFile(path, new TextEncoder().encode(html));
    logger.info('export', `HTML 导出完成: path=${path}, 消息数=${messages.length}`);
  }
}

export async function exportAsPdf(conversationId: string) {
  logger.info('export', `导出 PDF: convId=${conversationId}`);
  const { title, model, messages } = await fetchConversationData(conversationId);
  const html = await buildHtmlDocument(title, model, messages);
  const pdfBytes = await invoke<number[]>('export_pdf', { html });
  const path = await save({ defaultPath: `${title}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (path) {
    await writeFile(path, new Uint8Array(pdfBytes));
    logger.info('export', `PDF 导出完成: path=${path}, 消息数=${messages.length}, PDF大小=${pdfBytes.length}字节`);
  }
}
