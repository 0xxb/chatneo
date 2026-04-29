/**
 * 计算 textarea 中指定字符偏移处的像素坐标（相对于 textarea 元素）。
 * 原理：创建一个不可见的镜像 div，复制 textarea 的样式和文本到光标位置，
 * 用一个 span 标记光标，测量 span 的位置。
 */

const MIRROR_PROPS = [
  'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
  'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
  'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize',
  'whiteSpace', 'wordWrap', 'wordBreak',
] as const;

export interface CaretCoords {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoords(
  textarea: HTMLTextAreaElement,
  position: number,
): CaretCoords {
  const div = document.createElement('div');
  div.id = 'textarea-caret-mirror';
  document.body.appendChild(div);

  const style = div.style;
  const computed = getComputedStyle(textarea);

  style.position = 'absolute';
  style.visibility = 'hidden';
  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.overflow = 'hidden';

  for (const prop of MIRROR_PROPS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (style as any)[prop] = (computed as any)[prop];
  }

  div.textContent = textarea.value.substring(0, position);

  const span = document.createElement('span');
  // Use zero-width space so the span has height
  span.textContent = textarea.value.substring(position) || '\u200b';
  div.appendChild(span);

  const coords: CaretCoords = {
    top: span.offsetTop - textarea.scrollTop,
    left: span.offsetLeft,
    height: parseInt(computed.lineHeight) || span.offsetHeight,
  };

  document.body.removeChild(div);
  return coords;
}
