/**
 * Model capability catalog — cached from LiteLLM.
 *
 * Provides default model capabilities for any model.
 * On startup, loads from the bundled asset. Users can update via settings.
 * Updated data is saved to appDataDir/model-catalog.json.
 */

import type { ModelCapabilities } from './model-capabilities';
import { readTextFile, writeTextFile, BaseDirectory, exists } from '@tauri-apps/plugin-fs';
import { getNativeFetch } from './proxy-fetch';
import { splitModelName } from './utils';
import builtinCatalog from '../assets/model-catalog.json';

// ── Types ──────────────────────────────────────────────────────

interface CatalogData {
  lastUpdated: number;
  models: Record<string, ModelCapabilities>;
}

// ── State ──────────────────────────────────────────────────────

const CATALOG_FILE = 'model-catalog.json';
let catalog: CatalogData = builtinCatalog as CatalogData;

// ── Init ───────────────────────────────────────────────────────

/** Load user-updated catalog from appDataDir if available. */
export async function initModelCatalog(): Promise<void> {
  try {
    const hasFile = await exists(CATALOG_FILE, { baseDir: BaseDirectory.AppData });
    if (!hasFile) return;

    const raw = await readTextFile(CATALOG_FILE, { baseDir: BaseDirectory.AppData });
    const data = JSON.parse(raw) as CatalogData;
    if (data.models && data.lastUpdated) {
      catalog = data;
    }
  } catch {
    // 读取失败时使用内置版本
  }
}

// ── Query ──────────────────────────────────────────────────────

/**
 * Get default capabilities for a model ID. Returns `{}` if not found.
 *
 * 查找顺序：精确匹配 → 小写匹配 → 去掉 `:tag` 后缀匹配。
 * 最后一步是为了兼容 Ollama 的命名格式（如 "deepseek-r1:8b" 匹配 catalog 中的 "deepseek-r1"）。
 */
export function getDefaultCapabilities(modelId: string): ModelCapabilities {
  const lower = modelId.toLowerCase();
  const { base } = splitModelName(modelId);
  const hasTag = base !== modelId;

  return catalog.models[modelId]
    ?? catalog.models[lower]
    ?? (hasTag ? catalog.models[base] : undefined)
    ?? (hasTag ? catalog.models[base.toLowerCase()] : undefined)
    ?? {};
}

/** Get catalog metadata. */
export function getCatalogInfo(): { lastUpdated: number; modelCount: number } {
  return {
    lastUpdated: catalog.lastUpdated,
    modelCount: Object.keys(catalog.models).length,
  };
}

// ── LiteLLM refresh ────────────────────────────────────────────

/** API 布尔字段列表 — 字段名与 ModelCapabilities 一致 */
const API_BOOL_FIELDS = [
  'supports_vision',
  'supports_audio_input',
  'supports_audio_output',
  'supports_pdf_input',
  'supports_function_calling',
  'supports_parallel_function_calling',
  'supports_tool_choice',
  'supports_response_schema',
  'supports_system_messages',
  'supports_web_search',
  'supports_computer_use',
  'supports_prompt_caching',
  'supports_assistant_prefill',
  'supports_reasoning',
] as const;

type ApiBoolField = typeof API_BOOL_FIELDS[number];

interface LiteLLMModel extends Record<ApiBoolField, boolean | null> {
  id: string;
  mode: string | null;
}

function mapCapabilities(m: LiteLLMModel): ModelCapabilities {
  const caps: ModelCapabilities = {};

  for (const key of API_BOOL_FIELDS) {
    if (m[key] !== null) (caps as Record<string, boolean>)[key] = m[key]!;
  }

  if (m.mode === 'image_generation') caps.supports_image_output = true;

  if (m.supports_reasoning === true) {
    caps.thinking = { levels: ['high'], defaultLevel: 'high', canDisable: true };
  }

  return caps;
}

function extractBareId(litellmId: string): string | null {
  const idx = litellmId.indexOf('/');
  return idx !== -1 ? litellmId.slice(idx + 1) : null;
}

/**
 * Fetch all models from LiteLLM API and update the local cache.
 * Returns the number of models fetched.
 */
export async function refreshModelCatalog(
  onProgress?: (page: number) => void,
): Promise<{ modelCount: number }> {
  const fetchFn = getNativeFetch();
  const models: Record<string, ModelCapabilities> = {};
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    onProgress?.(page);
    const params = new URLSearchParams({ page_size: '500', page: String(page) });
    const res = await fetchFn(`https://api.litellm.ai/model_catalog?${params}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`API 请求失败: ${res.status}`);

    const data = (await res.json()) as { data: LiteLLMModel[]; has_more: boolean };

    for (const m of data.data) {
      const caps = mapCapabilities(m);
      models[m.id] = caps;
      const bareId = extractBareId(m.id);
      if (bareId && !(bareId in models)) {
        models[bareId] = caps;
      }
    }

    hasMore = data.has_more;
    page++;
  }

  const newCatalog: CatalogData = { lastUpdated: Date.now(), models };

  await writeTextFile(CATALOG_FILE, JSON.stringify(newCatalog), {
    baseDir: BaseDirectory.AppData,
  });

  catalog = newCatalog;
  return { modelCount: Object.keys(models).length };
}
