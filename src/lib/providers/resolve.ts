import { getSetting } from '../dao/settings-dao';
import { getProviderConfig } from '../dao/provider-dao';
import { safeJsonParse } from '../utils';
import type { ResolvedProvider, ProviderConfig } from './types';

/** Map negative builtin IDs to provider types. */
const BUILTIN_ID_MAP: Record<number, string> = {
  [-1]: 'ollama',
  [-2]: 'openai',
  [-3]: 'anthropic',
  [-4]: 'google',
  [-5]: 'azure-openai',
  [-6]: 'deepseek',
  [-7]: 'groq',
  [-8]: 'perplexity',
  [-9]: 'openrouter',
};

/** Resolve a builtin provider (stored in settings table) */
async function resolveBuiltin(type: string): Promise<ResolvedProvider> {
  const key = `builtin_provider:${type}`;
  const value = await getSetting(key);
  const config = value ? safeJsonParse<Record<string, unknown>>(value, {}) : {};
  return {
    providerType: type,
    config: { providerType: type, ...config } as ProviderConfig,
  };
}

/** Resolve a DB-stored provider by numeric ID */
async function resolveDb(providerId: number): Promise<ResolvedProvider | null> {
  const row = await getProviderConfig(providerId);
  if (!row) return null;
  const config = safeJsonParse<Record<string, unknown>>(row.config, {});
  return {
    providerType: row.type,
    config: { providerType: row.type, ...config } as ProviderConfig,
  };
}

/**
 * Resolve provider config by providerId.
 * - providerId < 0   → builtin provider (from settings, mapped by BUILTIN_ID_MAP)
 * - providerId > 0   → custom provider (from providers table)
 * - providerId === 0  → no provider selected
 */
export async function resolveProvider(providerId: number): Promise<ResolvedProvider | null> {
  if (providerId === 0 || providerId === null) return null;
  if (providerId < 0) {
    const type = BUILTIN_ID_MAP[providerId];
    if (!type) return null;
    return resolveBuiltin(type);
  }
  return resolveDb(providerId);
}
