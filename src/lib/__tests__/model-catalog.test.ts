import { describe, it, expect, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn(() => Promise.resolve(false)),
  BaseDirectory: { AppData: 'AppData' },
}));

vi.mock('../proxy-fetch', () => ({
  getNativeFetch: vi.fn(),
}));

vi.mock('../utils', () => ({
  splitModelName: (id: string) => {
    const idx = id.indexOf(':');
    return idx === -1 ? { base: id } : { base: id.slice(0, idx), variant: id.slice(idx + 1) };
  },
}));

vi.mock('../../assets/model-catalog.json', () => ({
  default: {
    lastUpdated: 1700000000000,
    models: {
      'gpt-4': { supports_vision: true, supports_function_calling: true },
      'GPT-4': { supports_vision: true },
      'claude-3-opus': { supports_system_messages: true },
      'deepseek-r1': { supports_reasoning: true },
    },
  },
}));

import { getDefaultCapabilities, getCatalogInfo, initModelCatalog, refreshModelCatalog } from '../model-catalog';
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { getNativeFetch } from '../proxy-fetch';

describe('getDefaultCapabilities', () => {
  it('returns exact match', () => {
    const result = getDefaultCapabilities('gpt-4');
    expect(result.supports_vision).toBe(true);
    expect(result.supports_function_calling).toBe(true);
  });

  it('returns lowercase match when exact fails', () => {
    // 'gpt-4' exists, so 'GPT-4' should match lowercase
    const result = getDefaultCapabilities('GPT-4');
    expect(result.supports_vision).toBe(true);
  });

  it('strips tag suffix for Ollama-style names', () => {
    const result = getDefaultCapabilities('deepseek-r1:8b');
    expect(result.supports_reasoning).toBe(true);
  });

  it('returns empty object for unknown model without tag', () => {
    const result = getDefaultCapabilities('unknown-model-xyz');
    expect(result).toEqual({});
  });

  it('returns empty object for unknown model with tag', () => {
    const result = getDefaultCapabilities('unknown-model:tag');
    expect(result).toEqual({});
  });

  it('matches case-insensitive tag variant (deepseek-r1:8B -> deepseek-r1)', () => {
    // base.toLowerCase() fallback
    const result = getDefaultCapabilities('DEEPSEEK-R1:8B');
    expect(result.supports_reasoning).toBe(true);
  });
});

describe('getCatalogInfo', () => {
  it('returns lastUpdated and modelCount', () => {
    const info = getCatalogInfo();
    expect(info.lastUpdated).toBe(1700000000000);
    expect(info.modelCount).toBe(4);
  });
});

describe('initModelCatalog', () => {
  it('uses builtin when no cached file exists', async () => {
    vi.mocked(exists).mockResolvedValueOnce(false);
    await initModelCatalog();
    // Should still work fine with builtin
    expect(getDefaultCapabilities('gpt-4').supports_vision).toBe(true);
  });

  it('loads cached catalog from disk', async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(readTextFile).mockResolvedValueOnce(JSON.stringify({
      lastUpdated: 2000000000000,
      models: { 'custom-model': { supports_vision: true } },
    }));
    await initModelCatalog();
    const info = getCatalogInfo();
    expect(info.lastUpdated).toBe(2000000000000);
    expect(getDefaultCapabilities('custom-model').supports_vision).toBe(true);
  });

  it('ignores invalid cached file', async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(readTextFile).mockResolvedValueOnce('invalid json{{{');
    await initModelCatalog();
    // Should not crash
  });
});

describe('refreshModelCatalog', () => {
  it('fetches models and writes to disk', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'openai/gpt-5', mode: null, supports_vision: true, supports_audio_input: null, supports_audio_output: null, supports_pdf_input: null, supports_function_calling: true, supports_parallel_function_calling: null, supports_tool_choice: null, supports_response_schema: null, supports_system_messages: true, supports_web_search: null, supports_computer_use: null, supports_prompt_caching: null, supports_assistant_prefill: null, supports_reasoning: null },
          ],
          has_more: false,
        }),
      });
    vi.mocked(getNativeFetch).mockReturnValue(mockFetch);
    vi.mocked(writeTextFile).mockResolvedValueOnce(undefined as any);

    const onProgress = vi.fn();
    const result = await refreshModelCatalog(onProgress);

    expect(result.modelCount).toBeGreaterThan(0);
    expect(onProgress).toHaveBeenCalledWith(1);
    expect(writeTextFile).toHaveBeenCalled();
    // Should have both full id and bare id
    expect(getDefaultCapabilities('gpt-5').supports_vision).toBe(true);
  });

  it('handles image_generation mode', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: [{ id: 'openai/dall-e-3', mode: 'image_generation', supports_vision: null, supports_audio_input: null, supports_audio_output: null, supports_pdf_input: null, supports_function_calling: null, supports_parallel_function_calling: null, supports_tool_choice: null, supports_response_schema: null, supports_system_messages: null, supports_web_search: null, supports_computer_use: null, supports_prompt_caching: null, supports_assistant_prefill: null, supports_reasoning: null }],
        has_more: false,
      }),
    });
    vi.mocked(getNativeFetch).mockReturnValue(mockFetch);
    vi.mocked(writeTextFile).mockResolvedValueOnce(undefined as any);

    await refreshModelCatalog();
    expect(getDefaultCapabilities('dall-e-3').supports_image_output).toBe(true);
  });

  it('handles reasoning model', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: [{ id: 'anthropic/claude-think', mode: null, supports_vision: null, supports_audio_input: null, supports_audio_output: null, supports_pdf_input: null, supports_function_calling: null, supports_parallel_function_calling: null, supports_tool_choice: null, supports_response_schema: null, supports_system_messages: null, supports_web_search: null, supports_computer_use: null, supports_prompt_caching: null, supports_assistant_prefill: null, supports_reasoning: true }],
        has_more: false,
      }),
    });
    vi.mocked(getNativeFetch).mockReturnValue(mockFetch);
    vi.mocked(writeTextFile).mockResolvedValueOnce(undefined as any);

    await refreshModelCatalog();
    const caps = getDefaultCapabilities('claude-think');
    expect(caps.thinking).toBeDefined();
  });

  it('throws on API error', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.mocked(getNativeFetch).mockReturnValue(mockFetch);

    await expect(refreshModelCatalog()).rejects.toThrow('API 请求失败: 500');
  });

  it('handles pagination', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'page1/model', mode: null, supports_vision: null, supports_audio_input: null, supports_audio_output: null, supports_pdf_input: null, supports_function_calling: null, supports_parallel_function_calling: null, supports_tool_choice: null, supports_response_schema: null, supports_system_messages: null, supports_web_search: null, supports_computer_use: null, supports_prompt_caching: null, supports_assistant_prefill: null, supports_reasoning: null }],
          has_more: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'page2/model2', mode: null, supports_vision: true, supports_audio_input: null, supports_audio_output: null, supports_pdf_input: null, supports_function_calling: null, supports_parallel_function_calling: null, supports_tool_choice: null, supports_response_schema: null, supports_system_messages: null, supports_web_search: null, supports_computer_use: null, supports_prompt_caching: null, supports_assistant_prefill: null, supports_reasoning: null }],
          has_more: false,
        }),
      });
    vi.mocked(getNativeFetch).mockReturnValue(mockFetch);
    vi.mocked(writeTextFile).mockResolvedValueOnce(undefined as any);

    const onProgress = vi.fn();
    const result = await refreshModelCatalog(onProgress);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(1);
    expect(onProgress).toHaveBeenCalledWith(2);
    expect(result.modelCount).toBeGreaterThanOrEqual(2);
  });
});
