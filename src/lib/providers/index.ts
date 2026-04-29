import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAzure } from '@ai-sdk/azure';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGroq } from '@ai-sdk/groq';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createMistral } from '@ai-sdk/mistral';
import { createXai } from '@ai-sdk/xai';
import { createTogetherAI } from '@ai-sdk/togetherai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createCerebras } from '@ai-sdk/cerebras';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { createCohere } from '@ai-sdk/cohere';
import { createAlibaba } from '@ai-sdk/alibaba';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createVertex } from '@ai-sdk/google-vertex/edge';
import { createOllama } from 'ollama-ai-provider-v2';
import { createByteDance } from '@ai-sdk/bytedance';
import type { Experimental_VideoModelV3 } from '@ai-sdk/provider';
import type { LanguageModel, ImageModel } from 'ai';
import { resolveBaseURL } from './types';
import type { ProviderConfig } from './types';
import { getProxyFetch } from '../proxy-fetch';
import { DEFAULT_BASE_URLS, DEFAULT_BEDROCK_REGION, DEFAULT_VERTEX_LOCATION } from './defaults';

export type { ProviderConfig, ResolvedProvider } from './types';
export { resolveProvider } from './resolve';
export { fetchModels, canFetchModels } from './fetch-models';

/** Shared helper for plugins that need to resolve a model from plugin config + conversation fallback. */
export async function resolveModelForPlugin(
  config: { provider_id: number | null; model_id: string },
  conversation: { provider_id: number | null; model_id: string },
): Promise<LanguageModel | null> {
  const { resolveProvider: resolve } = await import('./resolve');
  const providerId = config.provider_id ?? conversation.provider_id;
  const modelId = config.model_id || conversation.model_id;
  if (providerId == null) return null;
  const resolved = await resolve(providerId);
  if (!resolved) return null;
  return createModel(resolved.config, modelId);
}

/**
 * Provider factory map — providers that share the same { apiKey, baseURL?, fetch } signature.
 * Each factory returns a provider instance; we call provider(modelId) to get the model.
 */
type ProviderFactory = (opts: { apiKey?: string; baseURL?: string; fetch?: typeof globalThis.fetch }) =>
  (modelId: string) => LanguageModel;

const SDK_PROVIDERS: Record<string, ProviderFactory> = {
  openai: createOpenAI,
  anthropic: createAnthropic,
  google: createGoogleGenerativeAI,
  deepseek: createDeepSeek,
  groq: createGroq,
  perplexity: createPerplexity,
  mistral: createMistral,
  xai: createXai,
  togetherai: createTogetherAI,
  fireworks: createFireworks,
  cerebras: createCerebras,
  deepinfra: createDeepInfra,
  cohere: createCohere,
  aliyun: createAlibaba,
};

/** Provider types that use createOpenAI with a custom baseURL (OpenAI-compatible). */
const OPENAI_COMPAT_TYPES = new Set([
  'openai-compatible', 'openrouter',
  'siliconflow', 'kimi', 'zhipu', 'volcengine', 'minimax',
  'sambanova', '302ai', 'aihubmix',
]);

/** Native SDK providers that support .imageModel(). */
type ImageProviderFactory = (opts: { apiKey?: string; baseURL?: string; fetch?: typeof globalThis.fetch }) =>
  { imageModel: (modelId: string) => ImageModel };

const IMAGE_SDK_PROVIDERS: Record<string, ImageProviderFactory> = {
  openai: createOpenAI,
  google: createGoogleGenerativeAI,
  xai: createXai,
  fireworks: createFireworks,
};

/**
 * Create a LanguageModel instance from provider config + model ID.
 */
export function createModel(config: ProviderConfig, modelId: string): LanguageModel {
  const { providerType } = config;
  const fetch = getProxyFetch();
  const apiKey = (config.apiKey as string) || '';
  const baseURL = resolveBaseURL(config);

  // Ollama — uses its own SDK with /api suffix
  if (providerType === 'ollama') {
    const ollamaURL = baseURL || 'http://localhost:11434';
    return createOllama({ baseURL: `${ollamaURL}/api`, fetch })(modelId);
  }

  // OpenAI-compatible — uses createOpenAI with .chat()
  if (OPENAI_COMPAT_TYPES.has(providerType)) {
    const effectiveBaseURL = baseURL || DEFAULT_BASE_URLS[providerType];
    if (!effectiveBaseURL) throw new Error(`${providerType} 需要配置 API 地址`);
    return createOpenAI({ apiKey, baseURL: effectiveBaseURL, fetch }).chat(modelId);
  }

  // Azure OpenAI — has extra resourceName / apiVersion fields
  if (providerType === 'azure-openai') {
    return createAzure({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      ...(config.resourceName ? { resourceName: config.resourceName as string } : {}),
      ...(config.apiVersion ? { apiVersion: config.apiVersion as string } : {}),
      fetch,
    })(modelId);
  }

  // Amazon Bedrock — uses AWS credentials
  if (providerType === 'bedrock') {
    return createAmazonBedrock({
      region: (config.region as string) || DEFAULT_BEDROCK_REGION,
      accessKeyId: (config.accessKeyId as string) || '',
      secretAccessKey: (config.secretAccessKey as string) || '',
      ...(config.sessionToken ? { sessionToken: config.sessionToken as string } : {}),
      ...(baseURL ? { baseURL } : {}),
      fetch,
    })(modelId);
  }

  // Google Vertex AI — express mode with API key
  if (providerType === 'vertex') {
    return createVertex({
      project: (config.project as string) || '',
      location: (config.location as string) || DEFAULT_VERTEX_LOCATION,
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      fetch,
    })(modelId);
  }

  // Native SDK providers — all share the same { apiKey, baseURL?, fetch } pattern
  const factory = SDK_PROVIDERS[providerType];
  if (factory) {
    return factory({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      fetch,
    })(modelId);
  }

  throw new Error(`不支持的 provider 类型: ${providerType}`);
}

/**
 * Create an ImageModel instance from provider config + model ID.
 * Used for models with supports_image_output capability.
 */
export function createImageModel(config: ProviderConfig, modelId: string): ImageModel {
  const { providerType } = config;
  const fetch = getProxyFetch();
  const apiKey = (config.apiKey as string) || '';
  const baseURL = resolveBaseURL(config);

  // OpenAI-compatible — uses createOpenAI with .imageModel()
  if (OPENAI_COMPAT_TYPES.has(providerType)) {
    const effectiveBaseURL = baseURL || DEFAULT_BASE_URLS[providerType];
    if (!effectiveBaseURL) throw new Error(`${providerType} 需要配置 API 地址`);
    return createOpenAI({ apiKey, baseURL: effectiveBaseURL, fetch }).imageModel(modelId);
  }

  // Native SDK providers that support imageModel
  const factory = IMAGE_SDK_PROVIDERS[providerType];
  if (factory) {
    const provider = factory({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      fetch,
    });
    return provider.imageModel(modelId);
  }

  throw new Error(`${providerType} 不支持图片生成`);
}

/**
 * Create a VideoModel instance from provider config + model ID.
 * Used for models with supports_video_output capability.
 */
export function createVideoModel(config: ProviderConfig, modelId: string): Experimental_VideoModelV3 {
  const { providerType } = config;
  const fetch = getProxyFetch();
  const apiKey = (config.apiKey as string) || '';
  const baseURL = resolveBaseURL(config);

  // ByteDance / Volcengine — uses @ai-sdk/bytedance
  if (providerType === 'volcengine') {
    const effectiveBaseURL = baseURL || DEFAULT_BASE_URLS[providerType];
    return createByteDance({ apiKey, baseURL: effectiveBaseURL, fetch }).video(modelId);
  }

  throw new Error(`${providerType} 不支持视频生成`);
}
