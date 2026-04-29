import { embed, embedMany } from 'ai';
import { resolveProvider } from './providers';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createCohere } from '@ai-sdk/cohere';
import { createAlibaba } from '@ai-sdk/alibaba';
import { createOllama } from 'ollama-ai-provider-v2';
import { getProxyFetch } from './proxy-fetch';
import { resolveBaseURL } from './providers/types';
import { logger } from './logger';

// Provider types that support embedding via their native SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EMBEDDING_PROVIDERS: Record<string, (opts: any) => any> = {
  openai: createOpenAI,
  google: createGoogleGenerativeAI,
  mistral: createMistral,
  cohere: createCohere,
  aliyun: createAlibaba,
};

// OpenAI-compatible providers (can use createOpenAI with custom baseURL)
const OPENAI_COMPAT_EMBEDDING = new Set([
  'openai-compatible', 'openrouter', 'siliconflow', 'deepseek',
  'kimi', 'zhipu', 'volcengine', 'minimax', 'sambanova', '302ai', 'aihubmix',
]);

/** Check if a provider type supports embedding. */
export function supportsEmbedding(providerType: string): boolean {
  return providerType in EMBEDDING_PROVIDERS || OPENAI_COMPAT_EMBEDDING.has(providerType) || providerType === 'ollama';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createEmbeddingProvider(providerType: string, config: any): any {
  const fetch = getProxyFetch();
  const apiKey = config.apiKey || '';
  const baseURL = resolveBaseURL(config);
  const opts = { apiKey, ...(baseURL ? { baseURL } : {}), fetch };

  if (EMBEDDING_PROVIDERS[providerType]) {
    return EMBEDDING_PROVIDERS[providerType](opts);
  }
  if (OPENAI_COMPAT_EMBEDDING.has(providerType)) {
    return createOpenAI(opts);
  }
  if (providerType === 'ollama') {
    const ollamaURL = baseURL || 'http://localhost:11434';
    return createOllama({ baseURL: `${ollamaURL}/api`, fetch });
  }
  throw new Error(`服务商类型 "${providerType}" 不支持 Embedding`);
}

export async function generateEmbedding(
  providerId: number | null,
  modelId: string,
  text: string,
): Promise<number[]> {
  const provider = await getProvider(providerId);
  const model = provider.textEmbeddingModel(modelId);
  const { embedding } = await embed({ model, value: text });
  logger.info('embedding', `生成 embedding: model=${modelId}, 维度=${embedding.length}`);
  return embedding;
}

export async function generateEmbeddings(
  providerId: number | null,
  modelId: string,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const provider = await getProvider(providerId);
  const model = provider.textEmbeddingModel(modelId);
  const { embeddings } = await embedMany({ model, values: texts });
  logger.info('embedding', `批量 embedding: model=${modelId}, 数量=${embeddings.length}, 维度=${embeddings[0]?.length}`);
  return embeddings;
}

async function getProvider(providerId: number | null) {
  if (providerId === null) {
    // Ollama local
    const fetch = getProxyFetch();
    return createOllama({ baseURL: 'http://localhost:11434/api', fetch });
  }
  const resolved = await resolveProvider(providerId);
  if (!resolved) throw new Error('未找到 Embedding 服务商');
  return createEmbeddingProvider(resolved.providerType, resolved.config);
}
