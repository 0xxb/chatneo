import { describe, it, expect, vi } from 'vitest';
import {
  resolveModelType,
  resolveCapabilities,
  buildThinkingOptions,
  type ModelCapabilities,
  type ThinkingLevel,
} from '../model-capabilities';

// Mock model-catalog to avoid Tauri/FS dependencies
vi.mock('../model-catalog', () => ({
  getDefaultCapabilities: (modelId: string) => {
    const catalog: Record<string, ModelCapabilities> = {
      'gpt-4': { supports_vision: true, supports_function_calling: true },
      'dall-e-3': { supports_image_output: true },
      'claude-3-opus': { supports_vision: true, supports_system_messages: true },
    };
    return catalog[modelId] ?? {};
  },
}));

describe('resolveModelType', () => {
  it('returns "chat" for text-only models', () => {
    expect(resolveModelType({ supports_vision: true })).toBe('chat');
  });

  it('returns "image" for image output models', () => {
    expect(resolveModelType({ supports_image_output: true })).toBe('image');
  });

  it('returns "video" for video output models', () => {
    expect(resolveModelType({ supports_video_output: true })).toBe('video');
  });

  it('returns "audio" for audio output models', () => {
    expect(resolveModelType({ supports_audio_output: true })).toBe('audio');
  });

  it('prioritizes image over video and audio', () => {
    expect(resolveModelType({
      supports_image_output: true,
      supports_video_output: true,
      supports_audio_output: true,
    })).toBe('image');
  });

  it('returns "chat" for empty capabilities', () => {
    expect(resolveModelType({})).toBe('chat');
  });
});

describe('resolveCapabilities', () => {
  it('returns catalog defaults when no user caps', () => {
    const result = resolveCapabilities(null, 'gpt-4');
    expect(result.supports_vision).toBe(true);
    expect(result.supports_function_calling).toBe(true);
  });

  it('merges user caps over defaults', () => {
    const result = resolveCapabilities({ supports_vision: false }, 'gpt-4');
    expect(result.supports_vision).toBe(false);
    expect(result.supports_function_calling).toBe(true);
  });

  it('returns empty object for unknown model with no user caps', () => {
    const result = resolveCapabilities(undefined, 'unknown-model');
    expect(result).toEqual({});
  });

  it('does not override with undefined user values', () => {
    const result = resolveCapabilities({ supports_vision: undefined }, 'gpt-4');
    expect(result.supports_vision).toBe(true);
  });
});

describe('buildThinkingOptions', () => {
  it('returns empty object for "off" on most providers', () => {
    expect(buildThinkingOptions('openai', 'off')).toEqual({});
    expect(buildThinkingOptions('anthropic', 'off')).toEqual({});
    expect(buildThinkingOptions('google', 'off')).toEqual({});
  });

  it('returns explicit disable for ollama when "off"', () => {
    expect(buildThinkingOptions('ollama', 'off')).toEqual({ ollama: { think: false } });
  });

  it('returns reasoningEffort for openai-compatible providers', () => {
    for (const type of ['openai', 'openai-compatible', 'openrouter', 'azure-openai']) {
      const result = buildThinkingOptions(type, 'medium');
      expect(result).toEqual({ openai: { reasoningEffort: 'medium' } });
    }
  });

  it('returns thinking config for anthropic', () => {
    const result = buildThinkingOptions('anthropic', 'high');
    expect(result).toEqual({
      anthropic: { thinking: { type: 'enabled', budgetTokens: 30000 } },
    });
  });

  it('returns thinkingConfig for google', () => {
    const result = buildThinkingOptions('google', 'low');
    expect(result).toEqual({
      google: { thinkingConfig: { thinkingBudget: 2048, includeThoughts: true } },
    });
  });

  it('returns thinking enabled for deepseek', () => {
    const result = buildThinkingOptions('deepseek', 'high');
    expect(result).toEqual({ deepseek: { thinking: { type: 'enabled' } } });
  });

  it('returns think:true for ollama when enabled', () => {
    expect(buildThinkingOptions('ollama', 'high')).toEqual({ ollama: { think: true } });
  });

  it('returns empty object for unknown provider', () => {
    expect(buildThinkingOptions('unknown', 'high')).toEqual({});
  });

  it('covers all anthropic budget levels', () => {
    const budgets: Record<ThinkingLevel, number> = { off: 0, low: 5000, medium: 10000, high: 30000 };
    for (const level of ['low', 'medium', 'high'] as ThinkingLevel[]) {
      const result = buildThinkingOptions('anthropic', level);
      expect(result.anthropic.thinking.budgetTokens).toBe(budgets[level]);
    }
  });
});
