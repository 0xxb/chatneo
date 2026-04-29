export interface ProviderConfig {
  providerType: string;
  baseURL?: string;
  apiKey?: string;
  [key: string]: unknown;
}

/** Strip trailing slashes from a URL. */
export function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Extract and trim baseURL from config, with optional fallback. Strips trailing slashes. */
export function resolveBaseURL(config: ProviderConfig, fallback?: string): string | undefined {
  const url = (config.baseURL as string)?.trim() || fallback;
  return url ? stripTrailingSlashes(url) : url;
}

export interface ResolvedProvider {
  providerType: string;
  config: ProviderConfig;
}

export interface ImageGenerationSettings {
  size?: string;
  aspectRatio?: string;
  n?: number;
}
