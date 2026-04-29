/**
 * 从 LiteLLM Model Catalog API 全量拉取模型能力数据，
 * 生成 src/assets/model-catalog.json 供应用内置使用。
 *
 * 用法: npx tsx scripts/generate-model-catalog.ts
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE = 'https://api.litellm.ai/model_catalog';
const PAGE_SIZE = 500;
const OUTPUT = resolve(__dirname, '../src/assets/model-catalog.json');

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
  provider: string;
  mode: string | null;
}

interface ModelCapabilities extends Partial<Record<ApiBoolField, boolean>> {
  thinking?: { levels: string[]; defaultLevel: string; canDisable: boolean } | null;
  supports_image_output?: boolean;
}

function mapCapabilities(m: LiteLLMModel): ModelCapabilities {
  const caps: ModelCapabilities = {};

  for (const key of API_BOOL_FIELDS) {
    if (m[key] !== null) caps[key] = m[key]!;
  }

  if (m.mode === 'image_generation') caps.supports_image_output = true;
  if (m.supports_reasoning === true) {
    caps.thinking = { levels: ['high'], defaultLevel: 'high', canDisable: true };
  }

  return caps;
}

/** Extract bare model ID from LiteLLM prefixed IDs like "xai/grok-2" */
function extractBareId(litellmId: string): string | null {
  const idx = litellmId.indexOf('/');
  return idx !== -1 ? litellmId.slice(idx + 1) : null;
}

async function fetchAllModels(): Promise<Map<string, ModelCapabilities>> {
  const result = new Map<string, ModelCapabilities>();
  let page = 1;
  let hasMore = true;
  let total = 0;

  while (hasMore) {
    const url = `${API_BASE}?page_size=${PAGE_SIZE}&page=${page}`;
    process.stdout.write(`\r获取第 ${page} 页...`);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`API 请求失败: ${res.status}`);

    const data = await res.json() as {
      data: LiteLLMModel[];
      has_more: boolean;
      total_count: number;
    };

    for (const m of data.data) {
      const caps = mapCapabilities(m);
      // 注册完整 ID
      result.set(m.id, caps);
      // 注册去掉 provider 前缀的 bare ID（如果有且不冲突）
      const bareId = extractBareId(m.id);
      if (bareId && !result.has(bareId)) {
        result.set(bareId, caps);
      }
    }

    total = data.total_count;
    hasMore = data.has_more;
    page++;
  }

  console.log(`\r已获取 ${total} 个模型，映射为 ${result.size} 个条目`);
  return result;
}

async function main() {
  console.log('从 LiteLLM API 获取模型能力数据...');
  const models = await fetchAllModels();

  const catalog = {
    lastUpdated: Date.now(),
    models: Object.fromEntries(models),
  };

  writeFileSync(OUTPUT, JSON.stringify(catalog), 'utf-8');

  const sizeKB = (Buffer.byteLength(JSON.stringify(catalog)) / 1024).toFixed(0);
  console.log(`已写入 ${OUTPUT} (${sizeKB} KB, ${models.size} 个模型)`);
}

main().catch((err) => {
  console.error('生成失败:', err);
  process.exit(1);
});
