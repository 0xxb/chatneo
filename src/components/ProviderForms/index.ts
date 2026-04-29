// Re-export everything from the leaf-level registry module
export type { ProviderFormProps, DefaultConfigFn } from './registry';
export type { ProviderModel } from './registry';
export {
  registerProvider, getProviderForm, getDefaultConfig, isImplemented,
} from './registry';

// --- Built-in providers (not stored in DB, cannot be deleted) ---

export interface BuiltinProvider {
  id: number;
  type: string;
  name: string;
  icon: string;
}

const builtinProviders: BuiltinProvider[] = [
  // Tier 1 — 几乎所有同类产品都预设 (5-6/6)
  { id: -2, type: 'openai', name: 'OpenAI', icon: 'openai' },
  { id: -3, type: 'anthropic', name: 'Anthropic', icon: 'anthropic' },
  { id: -4, type: 'google', name: 'Google AI', icon: 'google' },
  { id: -5, type: 'azure-openai', name: 'Azure OpenAI', icon: 'azure-openai' },

  // Tier 2 — 多数产品预设 (3/6)
  { id: -6, type: 'deepseek', name: 'DeepSeek', icon: 'deepseek' },
  { id: -7, type: 'groq', name: 'Groq', icon: 'groq' },
  { id: -8, type: 'perplexity', name: 'Perplexity', icon: 'perplexity' },

  // Tier 3 — 本地推理 + 聚合路由
  { id: -1, type: 'ollama', name: 'Ollama', icon: 'ollama' },
  { id: -9, type: 'openrouter', name: 'OpenRouter', icon: 'openrouter' },
];

export function getBuiltinProviders() {
  return builtinProviders;
}

// --- Addable provider types (user can create instances of these) ---
// Grouped by category; `group` number drives separator insertion in menus.

export interface AddableProvider {
  type: string;
  name: string;
  icon: string;
  group: number;
}

const addableTypes: AddableProvider[] = [
  // Group 0 — Additional major providers (not built-in)
  { type: 'mistral', name: 'Mistral', icon: 'mistral', group: 0 },
  { type: 'xai', name: 'xAI (Grok)', icon: 'xai', group: 0 },
  { type: 'openai-compatible', name: 'OpenAI Compatible', icon: 'default', group: 0 },

  // Group 1 — Chinese providers
  { type: 'aliyun', name: '阿里云百炼', icon: 'aliyun', group: 1 },
  { type: 'siliconflow', name: '硅基流动', icon: 'siliconflow', group: 1 },
  { type: 'kimi', name: 'Kimi', icon: 'kimi', group: 1 },
  { type: 'zhipu', name: '智谱', icon: 'zhipu', group: 1 },
  { type: 'volcengine', name: '火山引擎', icon: 'volcengine', group: 1 },
  { type: 'minimax', name: 'MiniMax', icon: 'minimax', group: 1 },

  // Group 2 — Inference platforms
  { type: 'togetherai', name: 'Together AI', icon: 'togetherai', group: 2 },
  { type: 'fireworks', name: 'Fireworks', icon: 'fireworks', group: 2 },
  { type: 'cerebras', name: 'Cerebras', icon: 'cerebras', group: 2 },
  { type: 'deepinfra', name: 'DeepInfra', icon: 'deepinfra', group: 2 },
  { type: 'sambanova', name: 'SambaNova', icon: 'sambanova', group: 2 },
  { type: 'cohere', name: 'Cohere', icon: 'cohere', group: 2 },

  // Group 3 — Aggregators & proxies
  { type: '302ai', name: '302.AI', icon: '302ai', group: 3 },
  { type: 'aihubmix', name: 'AiHubMix', icon: 'aihubmix', group: 3 },

  // Group 4 — Cloud platforms
  { type: 'bedrock', name: 'Amazon Bedrock', icon: 'bedrock', group: 4 },
  { type: 'vertex', name: 'Google Vertex AI', icon: 'vertex', group: 4 },
];

export function getAddableTypes() {
  return addableTypes;
}

// Auto-register provider forms
import './ApiKeyForm';
