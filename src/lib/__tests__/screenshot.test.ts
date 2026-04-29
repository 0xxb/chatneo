/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('modern-screenshot', () => ({ domToPng: vi.fn() }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeImage: vi.fn() }));
vi.mock('@tauri-apps/api/image', () => ({ Image: { fromBytes: vi.fn() } }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { buildChatBgValue, collectRoundNodes, buildOnCloneEachNode } from '../../utils/screenshot';

describe('buildChatBgValue', () => {
  it('builds composite background with dimming overlay', () => {
    const result = buildChatBgValue({ bg: 'url("bg.png")', dimming: 0.3 });
    expect(result).toBe(
      'linear-gradient(rgba(0,0,0,0.3),rgba(0,0,0,0.3)), url("bg.png") center / cover no-repeat',
    );
  });

  it('handles zero dimming', () => {
    const result = buildChatBgValue({ bg: 'url("bg.png")', dimming: 0 });
    expect(result).toContain('rgba(0,0,0,0)');
  });

  it('handles gradient backgrounds', () => {
    const gradient = 'linear-gradient(135deg, #667eea, #764ba2)';
    const result = buildChatBgValue({ bg: gradient, dimming: 0.5 });
    expect(result).toContain(gradient);
    expect(result).toContain('center / cover no-repeat');
  });
});

describe('collectRoundNodes', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function addMessage(id: string, role: string) {
    const el = document.createElement('div');
    el.setAttribute('data-message-id', id);
    el.setAttribute('data-message-role', role);
    container.appendChild(el);
    return el;
  }

  it('returns empty array when message not found', () => {
    expect(collectRoundNodes('nonexistent')).toEqual([]);
  });

  it('returns single node for standalone user message', () => {
    const el = addMessage('m1', 'user');
    const result = collectRoundNodes('m1');
    expect(result).toEqual([el]);
  });

  it('returns user + assistant pair when clicking on user message', () => {
    const user = addMessage('m1', 'user');
    const assistant = addMessage('m2', 'assistant');
    const result = collectRoundNodes('m1');
    expect(result).toEqual([user, assistant]);
  });

  it('returns user + assistant pair when clicking on assistant message', () => {
    const user = addMessage('m1', 'user');
    const assistant = addMessage('m2', 'assistant');
    const result = collectRoundNodes('m2');
    expect(result).toEqual([user, assistant]);
  });

  it('returns only assistant when no preceding user', () => {
    const assistant = addMessage('m1', 'assistant');
    const result = collectRoundNodes('m1');
    expect(result).toEqual([assistant]);
  });

  it('handles error role as single node', () => {
    addMessage('m1', 'user');
    const err = addMessage('m2', 'error');
    const result = collectRoundNodes('m2');
    expect(result).toEqual([err]);
  });

  it('pairs correctly in multi-round conversation', () => {
    const u1 = addMessage('m1', 'user');
    const a1 = addMessage('m2', 'assistant');
    const u2 = addMessage('m3', 'user');
    const a2 = addMessage('m4', 'assistant');

    expect(collectRoundNodes('m1')).toEqual([u1, a1]);
    expect(collectRoundNodes('m2')).toEqual([u1, a1]);
    expect(collectRoundNodes('m3')).toEqual([u2, a2]);
    expect(collectRoundNodes('m4')).toEqual([u2, a2]);
  });

  it('does not pair user with non-adjacent assistant', () => {
    const u1 = addMessage('m1', 'user');
    addMessage('m2', 'error');
    addMessage('m3', 'assistant');

    // user m1's next sibling is error, not assistant
    expect(collectRoundNodes('m1')).toEqual([u1]);
  });
});

describe('buildOnCloneEachNode', () => {
  it('forces content-visibility to visible', () => {
    const handler = buildOnCloneEachNode([]);
    const el = document.createElement('div');
    el.style.contentVisibility = 'auto';
    el.style.contain = 'strict';
    handler(el);
    expect(el.style.contentVisibility).toBe('visible');
    expect(el.style.contain).toBe('none');
  });

  it('hides hover-only elements', () => {
    const handler = buildOnCloneEachNode([]);
    const el = document.createElement('div');
    el.classList.add('group-hover:opacity-100');
    handler(el);
    expect(el.style.display).toBe('none');
  });

  it('replaces mermaid SVG with img when data URL provided', () => {
    const handler = buildOnCloneEachNode(['data:image/png;base64,abc']);
    const el = document.createElement('div');
    el.dataset.streamdown = 'mermaid';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '200');
    el.appendChild(svg);
    handler(el);

    expect(el.querySelector('svg')).toBeNull();
    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.src).toContain('data:image/png;base64,abc');
  });

  it('skips mermaid replacement when no data URL', () => {
    const handler = buildOnCloneEachNode(['']);
    const el = document.createElement('div');
    el.dataset.streamdown = 'mermaid';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.appendChild(svg);
    handler(el);
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('does nothing for non-HTMLElement nodes', () => {
    const handler = buildOnCloneEachNode([]);
    const text = document.createTextNode('hello');
    // Should not throw
    handler(text);
  });
});
