import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSettingValue = vi.fn();
const mockListTools = vi.fn().mockResolvedValue([]);
const mockGetToolConfig = vi.fn().mockResolvedValue(null);
const mockGetAllTools = vi.fn().mockReturnValue([]);
const mockBuildToolsParam = vi.fn();
const mockGetTool = vi.fn();

vi.mock('../apply-settings', () => ({
  getSettingValue: (...args: unknown[]) => mockGetSettingValue(...args),
}));
vi.mock('../../store/model', () => ({
  useModelStore: {
    getState: () => ({
      webSearchEnabled: true,
    }),
  },
}));
vi.mock('../tool-registry', () => ({
  buildToolsParam: (...args: unknown[]) => mockBuildToolsParam(...args),
  getAllTools: (...args: unknown[]) => mockGetAllTools(...args),
  getTool: (...args: unknown[]) => mockGetTool(...args),
}));
vi.mock('../instruction', () => ({
  getConversationInstructions: vi.fn().mockResolvedValue([]),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../dao/tool-dao', () => ({
  listTools: (...args: unknown[]) => mockListTools(...args),
  getToolConfig: (...args: unknown[]) => mockGetToolConfig(...args),
}));
vi.mock('../mcp-manager', () => ({
  mcpManager: { getTools: vi.fn(() => ({})) },
}));
vi.mock('../utils', () => ({
  safeJsonParse: <T>(str: string, fallback: T): T => {
    try { return JSON.parse(str); } catch { return fallback; }
  },
}));

import { resolveTools } from '../chat-params';

describe('resolveTools — tools with DB rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettingValue.mockReturnValue(undefined);
  });

  it('uses DB row config when available for enabled tools', async () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'tools_enabled') return '1';
      return undefined;
    });
    mockGetAllTools.mockReturnValue([
      { id: 'tool1', enabledByDefault: true, defaultConfig: () => ({ key: 'default' }) },
    ]);
    mockListTools.mockResolvedValueOnce([
      { id: 'tool1', enabled: 1, config: '{"key":"custom"}' },
    ]);
    mockBuildToolsParam.mockReturnValue({ tool1: {} });

    await resolveTools(true);

    expect(mockBuildToolsParam).toHaveBeenCalledWith(
      ['tool1'],
      expect.any(Map),
    );
    const configMap = mockBuildToolsParam.mock.calls[0][1] as Map<string, unknown>;
    expect(configMap.get('tool1')).toEqual({ key: 'custom' });
  });

  it('respects DB enabled=0 over enabledByDefault=true', async () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'tools_enabled') return '1';
      return undefined;
    });
    mockGetAllTools.mockReturnValue([
      { id: 'tool1', enabledByDefault: true, defaultConfig: () => ({}) },
    ]);
    mockListTools.mockResolvedValueOnce([
      { id: 'tool1', enabled: 0, config: '{}' },
    ]);
    mockBuildToolsParam.mockReturnValue({});

    await resolveTools(true);

    expect(mockBuildToolsParam).toHaveBeenCalledWith([], expect.any(Map));
  });

  it('adds web-search tool when webSearchEnabled and not already included', async () => {
    mockGetSettingValue.mockReturnValue(undefined);
    mockBuildToolsParam.mockReturnValue(undefined);
    mockGetTool.mockReturnValue({
      id: 'web-search',
      defaultConfig: () => ({ engine: 'google' }),
      createToolSpec: (config: any) => ({ type: 'tool', config }),
    });
    mockGetToolConfig.mockResolvedValueOnce('{"engine":"bing"}');

    const result = await resolveTools(true);
    expect(result.tools).toBeDefined();
    expect(result.tools!['web-search']).toBeDefined();
    expect(result.maxSteps).toBe(5);
  });

  it('does not duplicate web-search if already in tools', async () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'tools_enabled') return '1';
      return undefined;
    });
    mockGetAllTools.mockReturnValue([]);
    mockListTools.mockResolvedValueOnce([]);
    mockBuildToolsParam.mockReturnValue({ 'web-search': { type: 'existing' } });

    const result = await resolveTools(true);
    expect(mockGetTool).not.toHaveBeenCalled();
    expect(result.tools!['web-search']).toEqual({ type: 'existing' });
  });

  it('uses cached row for web-search config when tools_enabled', async () => {
    mockGetSettingValue.mockImplementation((key: string) => {
      if (key === 'tools_enabled') return '1';
      return undefined;
    });
    mockGetAllTools.mockReturnValue([]);
    mockListTools.mockResolvedValueOnce([
      { id: 'web-search', enabled: 0, config: '{"engine":"cached"}' },
    ]);
    // buildToolsParam returns without web-search since it's disabled
    mockBuildToolsParam.mockReturnValue({});
    mockGetTool.mockReturnValue({
      id: 'web-search',
      defaultConfig: () => ({ engine: 'default' }),
      createToolSpec: (config: any) => ({ type: 'tool', config }),
    });

    const result = await resolveTools(true);
    // Should use cached row config
    expect(result.tools!['web-search']).toEqual({
      type: 'tool',
      config: { engine: 'cached' },
    });
  });
});
