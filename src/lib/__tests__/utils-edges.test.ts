import { describe, it, expect } from 'vitest';
import { isChatWindow } from '../utils';

describe('isChatWindow', () => {
  it('returns false when document is undefined (node env)', () => {
    // In vitest node environment, document is not defined
    // isChatWindow should return false gracefully
    expect(isChatWindow()).toBe(false);
  });
});
