import { describe, it, expect } from 'vitest';
import {
  cn,
  splitModelName,
  safeJsonParse,
  nowUnix,
  isChatWindow,
  sanitizeErrorDetail,
  BASE64_OMIT_PLACEHOLDER,
} from '../utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('filters falsy values', () => {
    expect(cn('px-2', false, null, undefined, 'py-1')).toBe('px-2 py-1');
  });

  it('merges conflicting tailwind classes', () => {
    // tailwind-merge should resolve conflicts
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('');
  });
});

describe('isChatWindow', () => {
  it('returns false when no data-chat-window attribute', () => {
    expect(isChatWindow()).toBe(false);
  });
});

describe('splitModelName', () => {
  it('returns base only when no colon', () => {
    expect(splitModelName('gpt-4')).toEqual({ base: 'gpt-4' });
  });

  it('splits on first colon', () => {
    expect(splitModelName('deepseek-r1:8b')).toEqual({ base: 'deepseek-r1', variant: '8b' });
  });

  it('handles multiple colons', () => {
    expect(splitModelName('model:tag:extra')).toEqual({ base: 'model', variant: 'tag:extra' });
  });

  it('handles empty string', () => {
    expect(splitModelName('')).toEqual({ base: '' });
  });

  it('handles colon at start', () => {
    expect(splitModelName(':tag')).toEqual({ base: '', variant: 'tag' });
  });

  it('handles colon at end', () => {
    expect(splitModelName('model:')).toEqual({ base: 'model', variant: '' });
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', 42)).toBe(42);
  });

  it('parses arrays', () => {
    expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', 'default')).toBe('default');
  });
});

describe('nowUnix', () => {
  it('returns a number close to current time in seconds', () => {
    const before = Math.floor(Date.now() / 1000);
    const result = nowUnix();
    const after = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

describe('sanitizeErrorDetail', () => {
  it('truncates base64 data URIs', () => {
    const longBase64 = 'A'.repeat(300);
    const input = `Error: data:image/png;base64,${longBase64} failed`;
    const result = sanitizeErrorDetail(input);
    expect(result).toContain(BASE64_OMIT_PLACEHOLDER);
    expect(result).not.toContain(longBase64);
  });

  it('keeps short base64 data URIs intact', () => {
    const shortBase64 = 'A'.repeat(50);
    const input = `data:image/png;base64,${shortBase64}`;
    expect(sanitizeErrorDetail(input)).toBe(input);
  });

  it('truncates long base64 in JSON-like fields', () => {
    const longBase64 = 'A'.repeat(300);
    const input = `"image_url": "${longBase64}"`;
    const result = sanitizeErrorDetail(input);
    expect(result).toContain(BASE64_OMIT_PLACEHOLDER);
  });

  it('returns plain text unchanged', () => {
    const input = 'Some normal error message';
    expect(sanitizeErrorDetail(input)).toBe(input);
  });
});
