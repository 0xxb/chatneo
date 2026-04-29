/**
 * Default base URLs for providers.
 * Used as placeholder and as fallback when no custom URL is set.
 */
export const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  deepseek: 'https://api.deepseek.com',
  groq: 'https://api.groq.com/openai/v1',
  perplexity: 'https://api.perplexity.ai',
  openrouter: 'https://openrouter.ai/api/v1',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
  aliyun: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  kimi: 'https://api.moonshot.cn/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  minimax: 'https://api.minimax.chat/v1',
  togetherai: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
  sambanova: 'https://api.sambanova.ai/v1',
  cohere: 'https://api.cohere.com/v2',
  '302ai': 'https://api.302.ai/v1',
  aihubmix: 'https://aihubmix.com/v1',
};

export const DEFAULT_BEDROCK_REGION = 'us-east-1';
export const DEFAULT_VERTEX_LOCATION = 'us-central1';
