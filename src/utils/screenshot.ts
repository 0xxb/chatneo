/**
 * 截图工具 — 将 DOM 元素渲染为 PNG 并复制到剪贴板。
 *
 * 实现原理：
 *   使用 modern-screenshot (domToPng) 将目标 DOM 克隆后序列化为 SVG foreignObject，
 *   再通过 canvas 转为 PNG data URL。图片通过 Tauri clipboard-manager 插件写入系统剪贴板。
 *
 * 关键兼容处理：
 *   1. Streamdown 的代码块、Mermaid 等组件使用了 CSS `content-visibility: auto` 做渲染优化，
 *      该属性会让浏览器跳过"不在视口内"元素的渲染。当 modern-screenshot 将 DOM 克隆到
 *      SVG foreignObject 中时，所有元素都被视为"不在视口内"，导致这些区域渲染为空白。
 *      通过 onCloneEachNode 回调将克隆节点的 content-visibility 强制设为 visible 来解决。
 *   2. Mermaid 图表渲染为内联 SVG，而 modern-screenshot 的原理是将 DOM 放入 SVG foreignObject，
 *      嵌套的 SVG（尤其含 foreignObject 的 Mermaid SVG）在浏览器中无法正确渲染。
 *      解决方案：截图前先将 Mermaid SVG 光栅化为 PNG data URL，在克隆节点中用 <img> 替换。
 *
 * 截图策略：
 *   - 单条消息 / 整个会话：直接对原始 DOM 元素截图，通过 domToPng 的 width/height + style.padding
 *     在克隆节点上添加边距，不修改原始 DOM，避免闪屏。
 *   - 当前回合（多条消息）：分别截图每条消息，再用 canvas 纵向拼接，避免离屏容器渲染空白的问题。
 *
 * 截图目标定位：
 *   通过 data-message-id / data-message-role / data-messages-container 等 DOM 属性定位，
 *   不依赖 React props 传递，保持组件解耦。
 */
import { domToPng } from 'modern-screenshot';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { Image } from '@tauri-apps/api/image';
import { logger } from '../lib/logger';

const PADDING = 16;
const SCALE = 2;
/** 离屏元素定位到可视区域外，避免影响布局/视觉闪烁。 */
const OFFSCREEN_LEFT_PX = -99999;

function getBgColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() || '#ffffff';
}

/** 获取聊天背景信息（渐变/图片 + 暗度遮罩），用于截图时合成背景 */
function getChatBgInfo(): { bg: string; dimming: number } | null {
  const html = document.documentElement;
  if (!html.hasAttribute('data-chat-bg')) return null;
  const cs = getComputedStyle(html);
  const bgImage = cs.getPropertyValue('--chat-bg-image').trim();
  if (!bgImage) return null;
  const dimming = parseFloat(cs.getPropertyValue('--chat-bg-dimming').trim()) || 0;
  return { bg: bgImage, dimming };
}

/** 构造带暗度遮罩的复合 background 值 */
export function buildChatBgValue(info: { bg: string; dimming: number }): string {
  const overlay = `linear-gradient(rgba(0,0,0,${info.dimming}),rgba(0,0,0,${info.dimming}))`;
  return `${overlay}, ${info.bg} center / cover no-repeat`;
}

/** 将 SVG 元素光栅化为 PNG data URL */
async function rasterizeSvg(svg: SVGSVGElement): Promise<string> {
  const bbox = svg.getBoundingClientRect();
  const w = Math.ceil(bbox.width * SCALE);
  const h = Math.ceil(bbox.height * SCALE);
  if (w === 0 || h === 0) return '';

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(bbox.width));
  clone.setAttribute('height', String(bbox.height));

  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = new window.Image();
    img.width = w;
    img.height = h;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 预光栅化元素内所有 Mermaid SVG，按 DOM 顺序返回 data URL 数组 */
async function rasterizeMermaidSvgs(root: HTMLElement): Promise<string[]> {
  const mermaidContainers = Array.from(root.querySelectorAll<HTMLElement>('[data-streamdown="mermaid"]'));
  const results: string[] = [];

  for (const container of mermaidContainers) {
    const svg = container.querySelector<SVGSVGElement>(':scope svg');
    if (svg) {
      results.push(await rasterizeSvg(svg));
    } else {
      results.push('');
    }
  }

  return results;
}

export function buildOnCloneEachNode(mermaidDataUrls: string[]) {
  let mermaidIndex = 0;
  return (cloned: Node) => {
    if (cloned instanceof HTMLElement) {
      if (cloned.style.contentVisibility) cloned.style.contentVisibility = 'visible';
      if (cloned.style.contain) cloned.style.contain = 'none';
      if (cloned.classList.contains('group-hover:opacity-100')) cloned.style.display = 'none';

      if (cloned.dataset.streamdown === 'mermaid') {
        const url = mermaidDataUrls[mermaidIndex++];
        if (url) {
          const svg = cloned.querySelector('svg');
          if (svg) {
            const img = document.createElement('img');
            img.src = url;
            img.style.width = `${svg.getAttribute('width') || svg.style.width || '100%'}`;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            svg.parentElement!.replaceChild(img, svg);
          }
        }
      }
    }
  };
}

function buildBgStyle(
  options: { transparent?: boolean },
  style: Record<string, string>,
): string | undefined {
  const chatBg = getChatBgInfo();
  if (options.transparent) return undefined;
  if (chatBg) { style.background = buildChatBgValue(chatBg); return '#000000'; }
  return getBgColor();
}

/** 单次截取（元素高度在安全范围内） */
async function captureSingle(
  element: HTMLElement,
  width: number,
  height: number,
  style: Record<string, string>,
  options: { transparent?: boolean },
): Promise<Uint8Array> {
  const bg = buildBgStyle(options, style);
  const mermaidDataUrls = await rasterizeMermaidSvgs(element);
  const dataUrl = await domToPng(element, {
    scale: SCALE,
    backgroundColor: bg,
    width,
    height,
    style,
    onCloneEachNode: buildOnCloneEachNode(mermaidDataUrls),
  });
  const res = await fetch(dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}

async function captureToBlob(
  element: HTMLElement,
  padding = 0,
  options: { transparent?: boolean } = {},
): Promise<Uint8Array> {
  const width = element.scrollWidth + padding * 2;
  const height = element.scrollHeight + padding * 2;
  const style: Record<string, string> = { margin: '0' };
  if (padding) {
    style.padding = `${padding}px`;
    style.boxSizing = 'content-box';
  }
  return captureSingle(element, width, height, style, options);
}

async function copyToClipboard(bytes: Uint8Array): Promise<void> {
  await writeImage(await Image.fromBytes(bytes));
}

/**
 * 将 width×height 的聊天背景（渐变/图片 + 暗度遮罩）光栅化为 PNG bitmap。
 * 通过离屏 div + domToPng 利用浏览器自己渲染 CSS 背景，保证与其他截图路径一致。
 */
async function rasterizeChatBg(
  info: { bg: string; dimming: number },
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const el = document.createElement('div');
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.background = buildChatBgValue(info);
  el.style.position = 'fixed';
  el.style.left = `${OFFSCREEN_LEFT_PX}px`;
  el.style.top = '0';
  document.body.appendChild(el);
  try {
    const dataUrl = await domToPng(el, { scale: 1, width, height });
    const res = await fetch(dataUrl);
    return await createImageBitmap(await res.blob());
  } finally {
    el.remove();
  }
}

/** 将多张 PNG 纵向拼接，四周留 padding，消息间留 gap */
async function stitchVertically(pngs: Uint8Array[], padding: number, gap: number): Promise<Uint8Array> {
  const bitmaps = await Promise.all(
    pngs.map((buf) => createImageBitmap(new Blob([buf], { type: 'image/png' }))),
  );

  const maxW = Math.max(...bitmaps.map((b) => b.width));
  const totalH = bitmaps.reduce((s, b) => s + b.height, 0) + gap * (bitmaps.length - 1);
  const canvasW = maxW + padding * SCALE * 2;
  const canvasH = totalH + padding * SCALE * 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;

  const chatBg = getChatBgInfo();
  let bgPainted = false;
  if (chatBg) {
    try {
      const bgBitmap = await rasterizeChatBg(chatBg, canvasW, canvasH);
      ctx.drawImage(bgBitmap, 0, 0);
      bgBitmap.close();
      bgPainted = true;
    } catch (e) {
      logger.warn('screenshot', `聊天背景光栅化失败，降级为主题底色: ${e}`);
    }
  }
  if (!bgPainted) {
    ctx.fillStyle = getBgColor();
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  let y = padding * SCALE;
  for (const bmp of bitmaps) {
    ctx.drawImage(bmp, padding * SCALE, y);
    y += bmp.height + gap;
    bmp.close();
  }

  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** 收集当前回合的消息节点（user + assistant 配对） */
export function collectRoundNodes(messageId: string): HTMLElement[] {
  const currentEl = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!currentEl) return [];

  const allMessages = Array.from(document.querySelectorAll<HTMLElement>('[data-message-id]'));
  const idx = allMessages.indexOf(currentEl);
  const role = currentEl.getAttribute('data-message-role');

  if (role === 'assistant') {
    const nodes: HTMLElement[] = [];
    if (idx > 0 && allMessages[idx - 1].getAttribute('data-message-role') === 'user') {
      nodes.push(allMessages[idx - 1]);
    }
    nodes.push(currentEl);
    return nodes;
  }

  if (role === 'user') {
    const nodes: HTMLElement[] = [currentEl];
    if (idx < allMessages.length - 1 && allMessages[idx + 1].getAttribute('data-message-role') === 'assistant') {
      nodes.push(allMessages[idx + 1]);
    }
    return nodes;
  }

  return [currentEl];
}

export async function screenshotMessage(messageId: string): Promise<void> {
  const el = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!el) return;
  await copyToClipboard(await captureToBlob(el, PADDING));
}

export async function screenshotRound(messageId: string): Promise<void> {
  const nodes = collectRoundNodes(messageId);
  if (!nodes.length) return;

  if (nodes.length === 1) {
    await copyToClipboard(await captureToBlob(nodes[0], PADDING));
    return;
  }

  const transparent = getChatBgInfo() !== null;
  const pngs = await Promise.all(nodes.map((n) => captureToBlob(n, 0, { transparent })));
  await copyToClipboard(await stitchVertically(pngs, PADDING, 32));
}

export async function screenshotAll(): Promise<void> {
  const container = document.querySelector<HTMLElement>('[data-messages-container]');
  if (!container) return;

  // 逐条消息分别截图再拼接
  const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]'));
  if (nodes.length === 0) {
    await copyToClipboard(await captureToBlob(container));
    return;
  }
  if (nodes.length === 1) {
    await copyToClipboard(await captureToBlob(nodes[0], PADDING));
    return;
  }
  const transparent = getChatBgInfo() !== null;
  const pngs = await Promise.all(nodes.map((n) => captureToBlob(n, 0, { transparent })));
  await copyToClipboard(await stitchVertically(pngs, PADDING, 32));
}
