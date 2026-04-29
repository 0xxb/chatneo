import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockResolveProvider = vi.fn();
const mockCreateModel = vi.fn().mockReturnValue({ modelId: 'test' });
const mockStreamText = vi.fn();
const mockGenerateText = vi.fn();

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  stepCountIs: (n: number) => ({ type: 'stepCount', value: n }),
}));
vi.mock('../providers', () => ({
  createModel: (...args: unknown[]) => mockCreateModel(...args),
  resolveProvider: (...args: unknown[]) => mockResolveProvider(...args),
}));
vi.mock('../model-capabilities', () => ({
  buildThinkingOptions: () => ({}),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  logApiRequest: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));
vi.mock('../attachments', () => ({
  resolveImageDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
  guessMediaType: vi.fn().mockReturnValue('application/pdf'),
}));
vi.mock('../message-parts', () => ({
  MEDIA_PART_TYPES: new Set(['image', 'video', 'audio']),
}));
vi.mock('../media-generation', () => ({
  generateImageChat: vi.fn(),
  generateVideoChat: vi.fn(),
}));

import { streamChat, nonStreamChat } from '../chat';

describe('streamChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onError when provider not resolved', async () => {
    mockResolveProvider.mockResolvedValueOnce(null);
    const onError = vi.fn();
    const onFinish = vi.fn();

    await streamChat({
      providerId: 1,
      modelId: 'gpt-4',
      messages: [],
      onChunk: vi.fn(),
      onFinish,
      onError,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: '未配置服务商' }));
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('streams text without thinking mode (textStream path)', async () => {
    mockResolveProvider.mockResolvedValueOnce({ providerType: 'openai', config: { apiKey: 'k' } });
    const chunks = ['Hello', ' World'];
    const textStream = (async function* () { for (const c of chunks) yield c; })();
    mockStreamText.mockReturnValueOnce({
      textStream,
      fullStream: (async function* () {})(),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 20, totalTokens: 30 }),
    });

    const onChunk = vi.fn();
    const onFinish = vi.fn();

    await streamChat({
      providerId: 1,
      modelId: 'gpt-4',
      messages: [{ role: 'user', content: '你好' }],
      onChunk,
      onFinish,
      onError: vi.fn(),
    });

    expect(onChunk).toHaveBeenCalledWith('Hello');
    expect(onChunk).toHaveBeenCalledWith('Hello World');
    expect(onFinish).toHaveBeenCalledWith('Hello World', undefined, undefined, expect.objectContaining({ totalTokens: 30 }));
  });

  it('streams with thinking mode (fullStream path)', async () => {
    mockResolveProvider.mockResolvedValueOnce({ providerType: 'anthropic', config: { apiKey: 'k' } });
    const fullStream = (async function* () {
      yield { type: 'reasoning-delta', text: '思考' };
      yield { type: 'text-delta', text: '回复' };
    })();
    mockStreamText.mockReturnValueOnce({
      textStream: (async function* () {})(),
      fullStream,
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 15, totalTokens: 20 }),
    });

    const onChunk = vi.fn();
    const onThinkingChunk = vi.fn();
    const onFinish = vi.fn();

    await streamChat({
      providerId: 1,
      modelId: 'claude-3',
      messages: [],
      thinkingLevel: 'high',
      onChunk,
      onThinkingChunk,
      onFinish,
      onError: vi.fn(),
    });

    expect(onThinkingChunk).toHaveBeenCalledWith('思考');
    expect(onChunk).toHaveBeenCalledWith('回复');
    expect(onFinish).toHaveBeenCalledWith('回复', '思考', undefined, expect.any(Object));
  });

  it('handles tool calls in fullStream', async () => {
    mockResolveProvider.mockResolvedValueOnce({ providerType: 'openai', config: { apiKey: 'k' } });
    const fullStream = (async function* () {
      yield { type: 'tool-call', toolCallId: 'tc1', toolName: 'search', input: { query: 'test' } };
      yield { type: 'tool-result', toolCallId: 'tc1', output: 'found' };
      yield { type: 'text-delta', text: '结果' };
    })();
    mockStreamText.mockReturnValueOnce({
      textStream: (async function* () {})(),
      fullStream,
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    });

    const onToolCallChunk = vi.fn();
    const onFinish = vi.fn();
    const tools = { search: {} };

    await streamChat({
      providerId: 1,
      modelId: 'gpt-4',
      messages: [],
      tools: tools as any,
      onChunk: vi.fn(),
      onToolCallChunk,
      onFinish,
      onError: vi.fn(),
    });

    expect(onToolCallChunk).toHaveBeenCalledTimes(2);
    expect(onFinish).toHaveBeenCalledWith('结果', undefined, expect.arrayContaining([
      expect.objectContaining({ id: 'tc1', toolName: 'search', state: 'result' }),
    ]), expect.any(Object));
  });

  it('handles AbortError silently', async () => {
    mockResolveProvider.mockResolvedValueOnce({ providerType: 'openai', config: { apiKey: 'k' } });
    const err = new Error('Aborted');
    err.name = 'AbortError';
    mockStreamText.mockReturnValueOnce({
      textStream: (async function* () { throw err; })(),
      fullStream: (async function* () {})(),
      usage: Promise.resolve({}),
    });

    const onError = vi.fn();
    await streamChat({
      providerId: 1,
      modelId: 'gpt-4',
      messages: [],
      onChunk: vi.fn(),
      onFinish: vi.fn(),
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError for non-abort errors', async () => {
    mockResolveProvider.mockResolvedValueOnce({ providerType: 'openai', config: { apiKey: 'k' } });
    mockStreamText.mockReturnValueOnce({
      textStream: (async function* () { throw new Error('网络错误'); })(),
      fullStream: (async function* () {})(),
      usage: Promise.resolve({}),
    });

    const onError = vi.fn();
    await streamChat({
      providerId: 1,
      modelId: 'gpt-4',
      messages: [],
      onChunk: vi.fn(),
      onFinish: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: '网络错误' }));
  });

  it('handles streamError from onError callback', async () => {
    mockResolveProvider.mockResolvedValueOnce({ providerType: 'anthropic', config: { apiKey: 'k' } });
    const fullStream = (async function* () {
      yield { type: 'text-delta', text: 'partial' };
    })();
    // Simulate streamText setting an error via its onError callback
    mockStreamText.mockImplementationOnce((opts: any) => {
      opts.onError({ error: new Error('stream broken') });
      return {
        textStream: (async function* () {})(),
        fullStream,
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      };
    });

    const onError = vi.fn();
    await streamChat({
      providerId: 1,
      modelId: 'claude',
      messages: [],
      thinkingLevel: 'high',
      onChunk: vi.fn(),
      onFinish: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'stream broken' }));
  });
});

describe('nonStreamChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onError when provider not resolved', async () => {
    mockResolveProvider.mockResolvedValueOnce(null);
    const onError = vi.fn();

    await nonStreamChat({
      providerId: 1,
      modelId: 'gpt-4',
      messages: [],
      onFinish: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: '未配置服务商' }));
  });

  it('generates text and calls onFinish', async () => {
    mockResolveProvider.mockResolvedValueOnce({ providerType: 'openai', config: { apiKey: 'k' } });
    mockGenerateText.mockResolvedValueOnce({
      text: '生成的回复',
      reasoningText: undefined,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });

    const onFinish = vi.fn();
    await nonStreamChat({
      providerId: 1,
      modelId: 'gpt-4',
      messages: [{ role: 'user', content: '你好' }],
      onFinish,
      onError: vi.fn(),
    });

    expect(onFinish).toHaveBeenCalledWith('生成的回复', undefined, expect.objectContaining({ totalTokens: 30 }));
  });

  it('includes thinking when thinkingLevel is set', async () => {
    mockResolveProvider.mockResolvedValueOnce({ providerType: 'anthropic', config: { apiKey: 'k' } });
    mockGenerateText.mockResolvedValueOnce({
      text: '回复',
      reasoningText: '深度思考内容',
      usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
    });

    const onFinish = vi.fn();
    await nonStreamChat({
      providerId: 1,
      modelId: 'claude-3',
      messages: [],
      thinkingLevel: 'high',
      onFinish,
      onError: vi.fn(),
    });

    expect(onFinish).toHaveBeenCalledWith('回复', '深度思考内容', expect.any(Object));
  });

  it('handles AbortError silently', async () => {
    mockResolveProvider.mockResolvedValueOnce({ providerType: 'openai', config: { apiKey: 'k' } });
    const err = new Error('Aborted');
    err.name = 'AbortError';
    mockGenerateText.mockRejectedValueOnce(err);

    const onError = vi.fn();
    await nonStreamChat({
      providerId: 1,
      modelId: 'gpt-4',
      messages: [],
      onFinish: vi.fn(),
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError for other errors', async () => {
    mockResolveProvider.mockResolvedValueOnce({ providerType: 'openai', config: { apiKey: 'k' } });
    mockGenerateText.mockRejectedValueOnce(new Error('rate limit'));

    const onError = vi.fn();
    await nonStreamChat({
      providerId: 1,
      modelId: 'gpt-4',
      messages: [],
      onFinish: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'rate limit' }));
  });
});
