import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@streamdown/code', () => ({
  createCodePlugin: vi.fn(() => ({ name: 'code' })),
}));
vi.mock('@streamdown/cjk', () => ({
  cjk: { name: 'cjk' },
}));
vi.mock('@streamdown/math', () => ({
  createMathPlugin: vi.fn(() => ({ name: 'math' })),
}));
vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid' },
}));

import { setCodeTheme, streamdownPlugins } from '../streamdown-plugins';
import { createCodePlugin } from '@streamdown/code';

describe('streamdownPlugins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports all plugins', () => {
    expect(streamdownPlugins.code).toBeDefined();
    expect(streamdownPlugins.cjk).toEqual({ name: 'cjk' });
    expect(streamdownPlugins.math).toEqual({ name: 'math' });
    expect(streamdownPlugins.mermaid).toEqual({ name: 'mermaid' });
  });

  it('setCodeTheme creates new code plugin', () => {
    const mockPlugin = { name: 'new-code' };
    vi.mocked(createCodePlugin).mockReturnValueOnce(mockPlugin as any);

    setCodeTheme('monokai');
    expect(createCodePlugin).toHaveBeenCalledWith({ themes: ['monokai', 'monokai'] });
    expect(streamdownPlugins.code).toBe(mockPlugin);
  });

  it('setCodeTheme does nothing for same theme', () => {
    // Already set to 'monokai' from previous test
    vi.mocked(createCodePlugin).mockClear();
    setCodeTheme('monokai');
    expect(createCodePlugin).not.toHaveBeenCalled();
  });

  it('setCodeTheme falls back to auto for unknown theme', () => {
    vi.mocked(createCodePlugin).mockReturnValueOnce({ name: 'auto' } as any);
    setCodeTheme('nonexistent');
    expect(createCodePlugin).toHaveBeenCalledWith({ themes: ['github-light', 'github-dark'] });
  });
});
