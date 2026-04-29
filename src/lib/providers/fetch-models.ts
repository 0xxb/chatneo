import { getNativeFetch } from '../proxy-fetch';
import { resolveBaseURL } from './types';
import type { ProviderConfig } from './types';

export interface FetchedModel {
  id: string;
  name: string;
  contextLength?: number;
  maxOutputTokens?: number;
}

type ModelAdapter = (
  config: Record<string, unknown>,
) => Promise<FetchedModel[]>;

// Ollama adapter - GET {baseURL}/api/tags
const ollamaAdapter: ModelAdapter = async (config) => {
  const url = resolveBaseURL(config as ProviderConfig, 'http://localhost:11434')!;
  const fetchFn = getNativeFetch();
  const signal = config.signal as AbortSignal | undefined;

  const res = await fetchFn(`${url}/api/tags`, { signal });
  if (!res.ok) {
    throw new Error(`Ollama 连接失败: ${res.status}`);
  }

  const data = (await res.json()) as {
    models: Array<{ name: string }>;
  };

  return data.models.map((m) => ({
    id: m.name,
    name: m.name,
  }));
};

// OpenAI-compatible adapter - GET {baseURL}/v1/models
const openaiCompatAdapter: ModelAdapter = async (config) => {
  const baseURL = resolveBaseURL(config as ProviderConfig);
  const apiKey = config.apiKey as string;

  if (!baseURL) throw new Error('缺少 Base URL');
  if (!apiKey) throw new Error('缺少 API Key');

  const url = baseURL;
  const fetchFn = getNativeFetch();
  const signal = config.signal as AbortSignal | undefined;

  const res = await fetchFn(`${url}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
  });

  if (!res.ok) {
    throw new Error(`获取模型列表失败: ${res.status}`);
  }

  const data = (await res.json()) as {
    data: Array<{ id: string }>;
  };

  return (data.data ?? []).map((m) => ({
    id: m.id,
    name: m.id,
  }));
};

// Anthropic adapter - custom headers + pagination
const anthropicAdapter: ModelAdapter = async (config) => {
  const baseURL = resolveBaseURL(config as ProviderConfig, 'https://api.anthropic.com')!;
  const apiKey = config.apiKey as string;
  if (!apiKey) throw new Error('缺少 API Key');

  const fetchFn = getNativeFetch();
  const signal = config.signal as AbortSignal | undefined;
  const models: FetchedModel[] = [];
  let afterId: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ limit: '100' });
    if (afterId) params.set('after_id', afterId);

    const res = await fetchFn(`${baseURL}/v1/models?${params}`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal,
    });

    if (!res.ok) {
      throw new Error(`获取模型列表失败: ${res.status}`);
    }

    const data = (await res.json()) as {
      data: Array<{ id: string; display_name?: string }>;
      has_more: boolean;
      last_id?: string;
    };

    for (const m of data.data) {
      models.push({
        id: m.id,
        name: m.display_name || m.id,
      });
    }

    hasMore = data.has_more;
    afterId = data.last_id;
  }

  return models;
};

// Google AI adapter - API key in query param
const googleAdapter: ModelAdapter = async (config) => {
  const baseURL = resolveBaseURL(config as ProviderConfig, 'https://generativelanguage.googleapis.com/v1beta')!;
  const apiKey = config.apiKey as string;
  if (!apiKey) throw new Error('缺少 API Key');

  const fetchFn = getNativeFetch();
  const signal = config.signal as AbortSignal | undefined;

  const res = await fetchFn(`${baseURL}/models?key=${apiKey}`, { signal });
  if (!res.ok) {
    throw new Error(`获取模型列表失败: ${res.status}`);
  }

  const data = (await res.json()) as {
    models: Array<{
      name: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
      inputTokenLimit?: number;
      outputTokenLimit?: number;
    }>;
  };

  return (data.models ?? [])
    .filter((m) =>
      m.supportedGenerationMethods?.includes('generateContent'),
    )
    .map((m) => ({
      id: m.name.replace(/^models\//, ''),
      name: m.displayName || m.name.replace(/^models\//, ''),
      contextLength: m.inputTokenLimit,
      maxOutputTokens: m.outputTokenLimit,
    }));
};

// OpenRouter adapter - rich metadata
const openrouterAdapter: ModelAdapter = async (config) => {
  const fetchFn = getNativeFetch();
  const signal = config.signal as AbortSignal | undefined;

  const res = await fetchFn('https://openrouter.ai/api/v1/models', { signal });
  if (!res.ok) {
    throw new Error(`获取模型列表失败: ${res.status}`);
  }

  const data = (await res.json()) as {
    data: Array<{
      id: string;
      name?: string;
      context_length?: number;
      top_provider?: { max_completion_tokens?: number };
    }>;
  };

  return (data.data ?? []).map((m) => ({
    id: m.id,
    name: m.name || m.id,
    contextLength: m.context_length,
    maxOutputTokens: m.top_provider?.max_completion_tokens,
  }));
};

// Cohere adapter - filter by chat endpoint
const cohereAdapter: ModelAdapter = async (config) => {
  const baseURL = resolveBaseURL(config as ProviderConfig, 'https://api.cohere.com/v2')!;
  const apiKey = config.apiKey as string;
  if (!apiKey) throw new Error('缺少 API Key');

  const fetchFn = getNativeFetch();
  const signal = config.signal as AbortSignal | undefined;

  const res = await fetchFn(`${baseURL}/models?endpoint=chat`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
  });

  if (!res.ok) {
    throw new Error(`获取模型列表失败: ${res.status}`);
  }

  const data = (await res.json()) as {
    models: Array<{
      name: string;
      context_length?: number;
    }>;
  };

  return (data.models ?? []).map((m) => ({
    id: m.name,
    name: m.name,
    contextLength: m.context_length,
  }));
};

// ── Adapter registry ──

const adapterMap: Record<string, ModelAdapter> = {
  ollama: ollamaAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  openrouter: openrouterAdapter,
  cohere: cohereAdapter,
};

// Providers whose model list API is OpenAI-compatible (GET /models)
const OPENAI_COMPAT_MODEL_FETCHERS = [
  'openai',
  'deepseek',
  'groq',
  'mistral',
  'xai',
  'togetherai',
  'cerebras',
  'siliconflow',
  'kimi',
  'deepinfra',
  'aliyun',
  'openai-compatible',
  '302ai',
  'aihubmix',
];

for (const t of OPENAI_COMPAT_MODEL_FETCHERS) {
  adapterMap[t] = openaiCompatAdapter;
}

// ── Public API ──

export function canFetchModels(providerType: string): boolean {
  return providerType in adapterMap;
}

const FETCH_TIMEOUT_MS = 30_000;

export async function fetchModels(
  providerType: string,
  config: Record<string, unknown>,
): Promise<FetchedModel[]> {
  const adapter = adapterMap[providerType];
  if (!adapter) {
    throw new Error(`提供商 ${providerType} 不支持自动获取模型`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await adapter({ ...config, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('获取模型列表超时，请检查网络连接');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
