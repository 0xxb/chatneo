import { describe, it, expect } from 'vitest';
import { normalizeLatexDelimiters } from '../../utils/latex';

describe('normalizeLatexDelimiters', () => {
  it('converts block math \\[...\\] to $$...$$', () => {
    expect(normalizeLatexDelimiters('\\[x^2\\]')).toBe('$$x^2$$');
  });

  it('converts inline math \\(...\\) to $...$', () => {
    expect(normalizeLatexDelimiters('\\(a+b\\)')).toBe('$a+b$');
  });

  it('handles both block and inline in same string', () => {
    const input = '公式 \\(E=mc^2\\) 和 \\[\\sum_{i=1}^n i\\]';
    const expected = '公式 $E=mc^2$ 和 $$\\sum_{i=1}^n i$$';
    expect(normalizeLatexDelimiters(input)).toBe(expected);
  });

  it('handles multiline block math', () => {
    const input = '\\[\na + b\n= c\n\\]';
    const expected = '$$\na + b\n= c\n$$';
    expect(normalizeLatexDelimiters(input)).toBe(expected);
  });

  it('handles multiple inline math expressions', () => {
    expect(normalizeLatexDelimiters('\\(a\\) 和 \\(b\\)')).toBe('$a$ 和 $b$');
  });

  it('returns plain text unchanged', () => {
    expect(normalizeLatexDelimiters('no math here')).toBe('no math here');
  });

  it('returns empty string unchanged', () => {
    expect(normalizeLatexDelimiters('')).toBe('');
  });
});
