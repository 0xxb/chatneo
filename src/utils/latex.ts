/**
 * Convert \[...\] and \(...\) LaTeX delimiters to $$...$$ and $...$ format
 * that remark-math can parse.
 */
export function normalizeLatexDelimiters(text: string): string {
  // \[...\] → $$...$$  (block math)
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
  // \(...\) → $...$  (inline math)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
  return text;
}
