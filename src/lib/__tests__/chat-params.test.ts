import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveChatParams, WEB_SEARCH_SYSTEM_PROMPT, injectInstructions, resolveTools } from '../chat-params';

// Mock dependencies
vi.mock('../apply-settings', () => ({
  getSettingValue: vi.fn(),
}));

vi.mock('../../store/model', () => ({
  useModelStore: { getState: () => ({ webSearchEnabled: false }) },
}));

vi.mock('../tool-registry', () => ({
  buildToolsParam: vi.fn(),
  getAllTools: vi.fn(() => []),
}));

vi.mock('../instruction', () => ({
  getConversationInstructions: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../dao/tool-dao', () => ({
  listTools: vi.fn(() => Promise.resolve([])),
  getToolConfig: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../mcp-manager', () => ({
  mcpManager: { getTools: vi.fn(() => ({})) },
}));

vi.mock('../utils', () => ({
  safeJsonParse: <T>(str: string, fallback: T): T => {
    try { return JSON.parse(str); } catch { return fallback; }
  },
}));

import { getSettingValue } from '../apply-settings';
import { getConversationInstructions } from '../instruction';
import { getAllTools, buildToolsParam } from '../tool-registry';

const mockGetSettingValue = vi.mocked(getSettingValue);

describe('resolveChatParams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettingValue.mockReturnValue(undefined);
  });

  it('uses state values when provided', () => {
    const state = {
      temperature: 0.7,
      maxOutputTokens: 2000,
      topP: 0.9,
      topK: 40,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
      seed: 42,
      stopSequences: ['stop'],
      thinkingLevel: 'high' as const,
    };

    const result = resolveChatParams(state as any);
    expect(result.temperature).toBe(0.7);
    expect(result.maxOutputTokens).toBe(2000);
    expect(result.topP).toBe(0.9);
    expect(result.topK).toBe(40);
    expect(result.frequencyPenalty).toBe(0.5);
    expect(result.presencePenalty).toBe(0.3);
    expect(result.seed).toBe(42);
    expect(result.stopSequences).toEqual(['stop']);
    expect(result.thinkingLevel).toBe('high');
  });

  it('falls back to settings when state values are undefined', () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        default_temperature: '0.8',
        default_max_output_tokens: '4096',
        default_top_p: '0.95',
        default_top_k: '50',
        default_frequency_penalty: '0.1',
        default_presence_penalty: '0.2',
        default_seed: '123',
      };
      return map[key];
    });

    const state = {
      temperature: undefined,
      maxOutputTokens: undefined,
      topP: undefined,
      topK: undefined,
      frequencyPenalty: undefined,
      presencePenalty: undefined,
      seed: undefined,
      stopSequences: undefined,
      thinkingLevel: 'off' as const,
    };

    const result = resolveChatParams(state as any);
    expect(result.temperature).toBe(0.8);
    expect(result.maxOutputTokens).toBe(4096);
    expect(result.topP).toBe(0.95);
    expect(result.topK).toBe(50);
    expect(result.frequencyPenalty).toBe(0.1);
    expect(result.presencePenalty).toBe(0.2);
    expect(result.seed).toBe(123);
  });

  it('returns undefined for non-finite setting values', () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'default_temperature') return 'NaN';
      if (key === 'default_max_output_tokens') return 'Infinity';
      return undefined;
    });

    const state = {} as any;
    const result = resolveChatParams(state);
    expect(result.temperature).toBeUndefined();
    expect(result.maxOutputTokens).toBeUndefined();
  });

  it('parses stop sequences from settings JSON', () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'default_stop_sequences') return '["\\n","END"]';
      return undefined;
    });

    const state = { stopSequences: undefined } as any;
    const result = resolveChatParams(state);
    expect(result.stopSequences).toEqual(['\n', 'END']);
  });

  it('parses custom headers from settings JSON', () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'default_custom_headers') return '{"X-Api-Key":"test"}';
      return undefined;
    });

    const state = {} as any;
    const result = resolveChatParams(state);
    expect(result.customHeaders).toEqual({ 'X-Api-Key': 'test' });
  });

  it('returns undefined customHeaders when no setting', () => {
    const state = {} as any;
    const result = resolveChatParams(state);
    expect(result.customHeaders).toBeUndefined();
  });

  it('returns undefined for all params when nothing configured', () => {
    const state = {} as any;
    const result = resolveChatParams(state);
    expect(result.temperature).toBeUndefined();
    expect(result.maxOutputTokens).toBeUndefined();
    expect(result.topP).toBeUndefined();
    expect(result.topK).toBeUndefined();
    expect(result.frequencyPenalty).toBeUndefined();
    expect(result.presencePenalty).toBeUndefined();
    expect(result.seed).toBeUndefined();
    expect(result.stopSequences).toBeUndefined();
    expect(result.maxRetries).toBeUndefined();
    expect(result.timeout).toBeUndefined();
  });
});

describe('WEB_SEARCH_SYSTEM_PROMPT', () => {
  it('contains web-search tool instruction', () => {
    expect(WEB_SEARCH_SYSTEM_PROMPT).toContain('web-search');
  });

  it('contains citation format instructions', () => {
    expect(WEB_SEARCH_SYSTEM_PROMPT).toContain('[1]');
    expect(WEB_SEARCH_SYSTEM_PROMPT).toContain('[2]');
  });
});

describe('injectInstructions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepends system message when instructions exist', async () => {
    vi.mocked(getConversationInstructions).mockResolvedValueOnce([
      { id: 'i1', title: '指令1', content: '你是助手', enabled: 1, sort_order: 0, created_at: 1000, updated_at: 1000 },
      { id: 'i2', title: '指令2', content: '简洁回答', enabled: 1, sort_order: 1, created_at: 1000, updated_at: 1000 },
    ]);

    const messages: any[] = [{ role: 'user', content: '你好' }];
    await injectInstructions('conv1', messages);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('你是助手');
    expect(messages[0].content).toContain('简洁回答');
  });

  it('does nothing when no instructions', async () => {
    vi.mocked(getConversationInstructions).mockResolvedValueOnce([]);
    const messages: any[] = [{ role: 'user', content: '你好' }];
    await injectInstructions('conv1', messages);
    expect(messages).toHaveLength(1);
  });

  it('handles errors gracefully', async () => {
    vi.mocked(getConversationInstructions).mockRejectedValueOnce(new Error('DB error'));
    const messages: any[] = [{ role: 'user', content: '你好' }];
    await injectInstructions('conv1', messages);
    expect(messages).toHaveLength(1); // No crash, no modification
  });
});

describe('resolveTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettingValue.mockReturnValue(undefined);
  });

  it('returns undefined tools when function calling not supported', async () => {
    const result = await resolveTools(false);
    expect(result.tools).toBeUndefined();
    expect(result.maxSteps).toBeUndefined();
  });

  it('returns undefined tools when tools_enabled is off', async () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'tools_enabled') return '0';
      return undefined;
    });

    const result = await resolveTools(true);
    expect(result.tools).toBeUndefined();
  });

  it('builds tools when tools_enabled is on', async () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'tools_enabled') return '1';
      if (key === 'tools_max_steps') return '3';
      return undefined;
    });
    vi.mocked(getAllTools).mockReturnValue([]);
    vi.mocked(buildToolsParam).mockReturnValue({ search: {} } as any);

    const result = await resolveTools(true);
    expect(result.maxSteps).toBe(3);
  });

  it('uses default maxSteps of 5 when no setting', async () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'tools_enabled') return '1';
      return undefined;
    });
    vi.mocked(getAllTools).mockReturnValue([]);
    vi.mocked(buildToolsParam).mockReturnValue({} as any);

    const result = await resolveTools(true);
    expect(result.maxSteps).toBe(5);
  });

  it('includes tools with enabled definitions', async () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'tools_enabled') return '1';
      return undefined;
    });
    vi.mocked(getAllTools).mockReturnValue([
      { id: 'tool1', enabledByDefault: true, defaultConfig: () => ({}) } as any,
      { id: 'tool2', enabledByDefault: false, defaultConfig: () => ({}) } as any,
    ]);
    vi.mocked(buildToolsParam).mockReturnValue({ tool1: {} } as any);

    const result = await resolveTools(true);
    expect(result.tools).toBeDefined();
  });
});
