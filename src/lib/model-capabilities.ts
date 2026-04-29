/**
 * Model capability types and utility functions.
 *
 * Capability data comes from the model catalog (model-catalog.ts).
 * This file only defines types and provider-specific helpers.
 */

import { getDefaultCapabilities } from './model-catalog';

// ── Thinking types ──────────────────────────────────────────────

export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

export interface ThinkingCapability {
  levels: ThinkingLevel[];
  defaultLevel: ThinkingLevel;
  canDisable: boolean;
}

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  off: '关闭',
  low: '低',
  medium: '中',
  high: '高',
};

// ── Capability interface ────────────────────────────────────────

export interface ModelCapabilities {
  thinking?: ThinkingCapability | null;

  // ── LiteLLM API 字段（与接口保持一致）──
  supports_vision?: boolean;
  supports_audio_input?: boolean;
  supports_audio_output?: boolean;
  supports_pdf_input?: boolean;
  supports_function_calling?: boolean;
  supports_parallel_function_calling?: boolean;
  supports_tool_choice?: boolean;
  supports_response_schema?: boolean;
  supports_system_messages?: boolean;
  supports_web_search?: boolean;
  supports_computer_use?: boolean;
  supports_prompt_caching?: boolean;
  supports_assistant_prefill?: boolean;
  supports_reasoning?: boolean;

  // ── 非 LiteLLM 字段（命名风格统一）──
  supports_image_output?: boolean;
  supports_video_input?: boolean;
  supports_video_output?: boolean;
  supports_file_input?: boolean;
  supports_streaming?: boolean;
  supports_code_execution?: boolean;
  supports_citations?: boolean;
  supports_fim?: boolean;
  supports_logprobs?: boolean;
  supports_temperature?: boolean;
}

// ── Model output type ─────────────────────────────────────────

export type ModelOutputType = 'chat' | 'image' | 'video' | 'audio';

/** Determine the model's primary output type based on its capabilities. */
export function resolveModelType(caps: ModelCapabilities): ModelOutputType {
  if (caps.supports_image_output) return 'image';
  if (caps.supports_video_output) return 'video';
  if (caps.supports_audio_output) return 'audio';
  return 'chat';
}

// ── Public API ──────────────────────────────────────────────────

/** Merge user-configured capabilities with catalog defaults. User values take precedence. */
export function resolveCapabilities(
  userCaps: Partial<ModelCapabilities> | null | undefined,
  modelId: string,
): ModelCapabilities {
  const defaults = getDefaultCapabilities(modelId);
  if (!userCaps) return { ...defaults };
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(userCaps)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as ModelCapabilities;
}

// ── Provider option builders ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProviderOptions = Record<string, Record<string, any>>;

const ANTHROPIC_BUDGET: Record<ThinkingLevel, number> = { off: 0, low: 5000, medium: 10000, high: 30000 };
const GOOGLE_BUDGET: Record<ThinkingLevel, number> = { off: 0, low: 2048, medium: 8192, high: 24576 };

/**
 * 根据 provider 类型和思考级别构建 providerOptions。
 *
 * AI SDK 没有统一的思考控制 API，每个 provider 使用各自的参数格式，
 * 因此需要在这里按 providerType 分别处理。新增 provider 时在此函数中添加对应分支即可。
 *
 * 注意：level === 'off' 时，大多数 provider 不需要传参（不传即不启用思考）。
 * 但部分 provider（如 Ollama）的推理模型默认会输出思考内容，
 * 必须显式传参关闭，否则 <think> 标签会混入正文。
 */
export function buildThinkingOptions(providerType: string, level: ThinkingLevel): ProviderOptions {
  if (level === 'off') {
    switch (providerType) {
      case 'ollama':
        return { ollama: { think: false } };
      default:
        return {};
    }
  }

  switch (providerType) {
    case 'ollama':
      return { ollama: { think: true } };
    case 'openai':
    case 'openai-compatible':
    case 'openrouter':
    case 'azure-openai':
      return { openai: { reasoningEffort: level } };
    case 'anthropic':
      return { anthropic: { thinking: { type: 'enabled', budgetTokens: ANTHROPIC_BUDGET[level] || 10000 } } };
    case 'google':
      return { google: { thinkingConfig: { thinkingBudget: GOOGLE_BUDGET[level] || 8192, includeThoughts: true } } };
    case 'deepseek':
      return { deepseek: { thinking: { type: 'enabled' } } };
    default:
      return {};
  }
}
