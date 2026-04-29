export interface ProviderConfig {
  id: string;
  name: string;
  icon: string;
}

export const defaultProviders: ProviderConfig[] = [
  // ── Built-in providers ───────────────────────────────────────
  { id: 'ollama', name: 'Ollama', icon: 'ollama' },
  { id: 'openai', name: 'OpenAI Compatible', icon: 'openai' },
  { id: 'anthropic', name: 'Anthropic Compatible', icon: 'anthropic' },

  // ── Third-party (alphabetical) ───────────────────────────────
  { id: '302ai', name: '302.AI', icon: '302ai' },
  { id: 'aihubmix', name: 'AiHubMix', icon: 'aihubmix' },
  { id: 'aliyun', name: '阿里云', icon: 'aliyun' },
  { id: 'azure-openai', name: 'Azure OpenAI', icon: 'azure-openai' },
  { id: 'baseten', name: 'Baseten', icon: 'default' },
  { id: 'bedrock', name: 'Amazon Bedrock', icon: 'default' },
  { id: 'cerebras', name: 'Cerebras', icon: 'cerebras' },
  { id: 'cohere', name: 'Cohere', icon: 'cohere' },
  { id: 'deepbricks', name: 'Deepbricks', icon: 'default' },
  { id: 'deepinfra', name: 'DeepInfra', icon: 'deepinfra' },
  { id: 'deepseek', name: 'DeepSeek', icon: 'deepseek' },
  { id: 'deepsearch', name: 'DeepSearch', icon: 'default' },
  { id: 'fireworks', name: 'Fireworks', icon: 'fireworks' },
  { id: 'github', name: 'GitHub Models', icon: 'default' },
  { id: 'google', name: 'Google AI (Gemini)', icon: 'google' },
  { id: 'groq', name: 'Groq', icon: 'groq' },
  { id: 'huggingface', name: 'Hugging Face', icon: 'default' },
  { id: 'hyperbolic', name: 'Hyperbolic', icon: 'default' },
  { id: 'jina', name: 'Jina', icon: 'default' },
  { id: 'kimi', name: 'Kimi', icon: 'kimi' },
  { id: 'lmstudio', name: 'LM Studio', icon: 'default' },
  { id: 'minimax', name: 'MiniMax', icon: 'minimax' },
  { id: 'mistral', name: 'Mistral', icon: 'mistral' },
  { id: 'opencode', name: 'OpenCode', icon: 'default' },
  { id: 'openrouter', name: 'OpenRouter', icon: 'openrouter' },
  { id: 'poe', name: 'Poe', icon: 'default' },
  { id: 'perplexity', name: 'Perplexity', icon: 'perplexity' },
  { id: 'sambanova', name: 'SambaNova', icon: 'sambanova' },
  { id: 'siliconflow', name: '硅基流动', icon: 'siliconflow' },
  { id: 'togetherai', name: 'Together AI', icon: 'togetherai' },
  { id: 'vercel', name: 'Vercel', icon: 'default' },
  { id: 'vertex', name: 'Vertex AI', icon: 'default' },
  { id: 'volcengine', name: '火山引擎', icon: 'volcengine' },
  { id: 'xai', name: 'xAI (Grok)', icon: 'xai' },
  { id: 'zai', name: 'Z.ai', icon: 'default' },
  { id: 'zen', name: 'Zen', icon: 'default' },
  { id: 'zhipu', name: '智谱', icon: 'zhipu' },
];
