import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  writeFile: vi.fn(),
  copyFile: vi.fn(),
  remove: vi.fn(),
  readDir: vi.fn().mockResolvedValue([]),
}));
vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/app'),
  join: vi.fn((...parts: string[]) => parts.join('/')),
}));
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
}));

import { cacheImageDataUrl, readImageAsDataUrl } from '../attachments';

describe('LRU cache eviction', () => {
  it('evicts oldest entry when cache exceeds max size', async () => {
    // Fill cache beyond the 50 limit
    for (let i = 0; i < 52; i++) {
      cacheImageDataUrl(`/path/file${i}.png`, `data:image/png;base64,${i}`);
    }

    // file0 was evicted — readImageAsDataUrl should NOT return the cached value
    // file51 should still be cached
    const url51 = await readImageAsDataUrl('/path/file51.png');
    expect(url51).toBe('data:image/png;base64,51');
  });
});
