import { resolveProvider } from './resolve';
import type { ImageGenerationSettings } from './types';

interface ModelEntry {
  modelId: string;
  imageSettings?: ImageGenerationSettings;
}

/**
 * Read imageSettings for a given provider + model from DB.
 * Reuses resolveProvider to avoid duplicating DB access logic.
 */
export async function getImageSettings(
  providerId: number,
  modelId: string,
): Promise<ImageGenerationSettings> {
  const resolved = await resolveProvider(providerId);
  if (!resolved) return {};

  const models = (resolved.config as Record<string, unknown>).models as ModelEntry[] | undefined;
  return models?.find((m) => m.modelId === modelId)?.imageSettings ?? {};
}
