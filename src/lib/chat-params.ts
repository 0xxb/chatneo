import { useModelStore } from '../store/model';
import { safeJsonParse } from './utils';
import { getSettingValue } from './apply-settings';
import { buildToolsParam, getAllTools } from './tool-registry';
import { getConversationInstructions } from './instruction';
import { logger } from './logger';
import * as toolDao from './dao/tool-dao';

export const WEB_SEARCH_SYSTEM_PROMPT = '请使用 web-search 工具搜索相关信息后回答。\n\n引用规则（必须严格遵守）：\n- 在每个引用了搜索结果的语句末尾标注来源编号，格式为 [1]、[2]、[3] 等\n- 编号对应搜索结果的顺序（第1条结果为[1]，第2条为[2]，以此类推）\n- 一个语句可以标注多个来源，如 [1][3]\n- 至少引用 2 个不同来源\n- 不要使用 [域名] 或 [标题] 格式，只使用数字编号';

function parseNumberOrUndefined(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Resolve shared chat parameters from store state + global settings. */
export function resolveChatParams(state: ReturnType<typeof useModelStore.getState>) {
  const temperature = state.temperature
    ?? parseNumberOrUndefined(getSettingValue('default_temperature'));
  const maxOutputTokens = state.maxOutputTokens
    ?? parseNumberOrUndefined(getSettingValue('default_max_output_tokens'));
  const topP = state.topP
    ?? parseNumberOrUndefined(getSettingValue('default_top_p'));
  const topK = state.topK
    ?? parseNumberOrUndefined(getSettingValue('default_top_k'));
  const frequencyPenalty = state.frequencyPenalty
    ?? parseNumberOrUndefined(getSettingValue('default_frequency_penalty'));
  const presencePenalty = state.presencePenalty
    ?? parseNumberOrUndefined(getSettingValue('default_presence_penalty'));
  const seed = state.seed
    ?? parseNumberOrUndefined(getSettingValue('default_seed'));

  let stopSequences: string[] | undefined;
  if (state.stopSequences) {
    stopSequences = state.stopSequences;
  } else {
    const raw = getSettingValue('default_stop_sequences');
    if (raw) stopSequences = safeJsonParse<string[]>(raw, []);
  }

  const maxRetries = parseNumberOrUndefined(getSettingValue('default_max_retries'));
  const timeout = parseNumberOrUndefined(getSettingValue('default_timeout'));
  const headersRaw = getSettingValue('default_custom_headers');
  const customHeaders = headersRaw ? safeJsonParse<Record<string, string>>(headersRaw, {}) : undefined;

  return { temperature, maxOutputTokens, topP, topK, frequencyPenalty, presencePenalty, seed, stopSequences, maxRetries, timeout, customHeaders, thinkingLevel: state.thinkingLevel };
}

export async function injectInstructions(convId: string, messages: import('ai').ModelMessage[]) {
  try {
    const instructions = await getConversationInstructions(convId);
    if (instructions.length > 0) {
      const content = instructions.map((i) => i.content).join('\n\n');
      messages.unshift({ role: 'system', content } as import('ai').ModelMessage);
    }
  } catch (e) {
    logger.error('instruction', `加载对话指令失败: ${e}`);
  }
}

/** Resolve tools + maxSteps based on global settings and web search state. */
export async function resolveTools(supportsFC: boolean) {
  let tools: ReturnType<typeof buildToolsParam>;
  let maxSteps: number | undefined;
  const toolsEnabled = (getSettingValue('tools_enabled') ?? '0') === '1';
  // Cache tool rows to avoid redundant DB calls when web-search falls through below.
  let cachedRowMap: Map<string, { id: string; enabled: number; config: string }> | undefined;
  if (toolsEnabled && supportsFC) {
    const rows = await toolDao.listTools();
    cachedRowMap = new Map(rows.map((r) => [r.id, r]));
    const definitions = getAllTools();

    const enabledIds: string[] = [];
    const configMap = new Map<string, Record<string, unknown>>();
    for (const def of definitions) {
      const row = cachedRowMap.get(def.id);
      const enabled = row ? row.enabled === 1 : def.enabledByDefault;
      if (enabled) {
        enabledIds.push(def.id);
        configMap.set(
          def.id,
          row ? safeJsonParse<Record<string, unknown>>(row.config, def.defaultConfig()) : def.defaultConfig(),
        );
      }
    }

    tools = buildToolsParam(enabledIds, configMap);
    const { mcpManager } = await import('./mcp-manager');
    const mcpTools = mcpManager.getTools();
    if (Object.keys(mcpTools).length > 0) {
      tools = { ...(tools ?? {}), ...mcpTools };
    }
    const maxStepsRaw = getSettingValue('tools_max_steps');
    maxSteps = maxStepsRaw ? Number(maxStepsRaw) : 5;
  }

  const webSearchEnabled = useModelStore.getState().webSearchEnabled;
  if (webSearchEnabled && supportsFC && !tools?.['web-search']) {
    const { getTool } = await import('./tool-registry');
    const wsDef = getTool('web-search');
    if (wsDef) {
      // Reuse cached row if available, otherwise fetch just this one config.
      const wsRow = cachedRowMap?.get('web-search');
      const wsConfigStr = wsRow ? wsRow.config : await toolDao.getToolConfig('web-search');
      const wsConfig = wsConfigStr ? safeJsonParse<Record<string, unknown>>(wsConfigStr, wsDef.defaultConfig()) : wsDef.defaultConfig();
      const wsTool = wsDef.createToolSpec(wsConfig);
      tools = { ...(tools ?? {}), 'web-search': wsTool };
      if (!maxSteps) maxSteps = 5;
    }
  }

  return { tools, maxSteps };
}
