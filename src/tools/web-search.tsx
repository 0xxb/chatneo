import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { registerTool, type ToolFormProps } from '../lib/tool-registry';
import { FormField } from '../components/Settings/FormField';
import { NativeSelect, NativeInput } from '../components/ui/native';
import i18n from '../locales';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function httpJson(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body: string | null = null) {
  const resp = await invoke<{ status: number; body: string }>('tool_http_request', { method, url, headers, body });
  if (resp.status < 200 || resp.status >= 300) throw new Error(`HTTP ${resp.status}: ${resp.body.slice(0, 200)}`);
  return JSON.parse(resp.body);
}

async function httpHtml(url: string, headers: Record<string, string>) {
  const resp = await invoke<{ status: number; body: string }>('tool_http_request', { method: 'GET', url, headers, body: null });
  if (resp.status < 200 || resp.status >= 300) throw new Error(`HTTP ${resp.status}: ${resp.body.slice(0, 200)}`);
  return new DOMParser().parseFromString(resp.body, 'text/html');
}

interface WebSearchConfig {
  engine: string;
  apiKey: string;
  googleCxId: string;
  searxngUrl: string;
  maxResults: number;
}

const ENGINES_NEEDING_KEY = ['google', 'bing', 'brave-api', 'tavily', 'jina', 'exa'];

function WebSearchConfigForm({ config, onSave }: ToolFormProps) {
  const { t } = useTranslation();
  const cfg = config as unknown as WebSearchConfig;

  const update = (patch: Partial<WebSearchConfig>) => onSave({ ...cfg, ...patch });

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-(--color-label-tertiary)">{t('tools.webSearch.configDesc')}</p>
      <FormField label={t('tools.webSearch.engine')}>
        <NativeSelect value={cfg.engine} onChange={(e) => update({ engine: e.target.value })}>
          <option value="brave">Brave（免费）</option>
          <option value="brave-api">Brave Search（API 密钥）</option>
          <option value="duckduckgo">DuckDuckGo（免费）</option>
          <option value="tavily">Tavily（API 密钥）</option>
          <option value="google">Google（API 密钥）</option>
          <option value="bing">Bing（API 密钥）</option>
          <option value="jina">Jina AI（API 密钥）</option>
          <option value="exa">Exa（API 密钥）</option>
          <option value="searxng">SearXNG（自建）</option>
        </NativeSelect>
      </FormField>
      {ENGINES_NEEDING_KEY.includes(cfg.engine) && (
        <FormField label={t('tools.webSearch.apiKey')}>
          <NativeInput
            type="password"
            value={cfg.apiKey}
            placeholder={t('tools.webSearch.apiKeyPlaceholder')}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
        </FormField>
      )}
      {cfg.engine === 'google' && (
        <FormField label={t('tools.webSearch.googleCxId')}>
          <NativeInput
            value={cfg.googleCxId}
            placeholder={t('tools.webSearch.googleCxIdPlaceholder')}
            onChange={(e) => update({ googleCxId: e.target.value })}
          />
        </FormField>
      )}
      {cfg.engine === 'searxng' && (
        <FormField label={t('tools.webSearch.searxngUrl')}>
          <NativeInput
            value={cfg.searxngUrl}
            placeholder={t('tools.webSearch.searxngUrlPlaceholder')}
            onChange={(e) => update({ searxngUrl: e.target.value })}
          />
        </FormField>
      )}
      <FormField label={t('tools.webSearch.maxResults')}>
        <NativeInput
          type="number"
          value={String(cfg.maxResults)}
          min="1"
          max="20"
          onChange={(e) => update({ maxResults: Number(e.target.value) })}
        />
      </FormField>
    </div>
  );
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ── Brave (HTML scraping, 免费) ──

async function searchBrave(query: string, maxResults: number): Promise<SearchResult[]> {
  const doc = await httpHtml(
    `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`,
    { 'User-Agent': BROWSER_UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.5' },
  );
  const results: SearchResult[] = [];
  const wrappers = doc.querySelectorAll('.result-wrapper');
  for (const el of Array.from(wrappers).slice(0, maxResults)) {
    const linkEl = el.querySelector('a[href^="http"]');
    const titleEl = el.querySelector('.title, .search-snippet-title');
    const snippetEl = el.querySelector('.generic-snippet .content, .snippet-description');
    const url = linkEl?.getAttribute('href') ?? '';
    const title = titleEl?.textContent?.trim() ?? '';
    const snippet = snippetEl?.textContent?.trim() ?? '';
    if (title && url && !url.includes('search.brave.com')) {
      results.push({ title, url, snippet });
    }
  }
  return results;
}

// ── Brave Search API ──

async function searchBraveApi(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const data = await httpJson('GET',
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
    { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
  );
  return (data.web?.results ?? []).slice(0, maxResults).map((item: { title: string; url: string; description: string }) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: item.description ?? '',
  }));
}

// ── DuckDuckGo (HTML scraping, 免费) ──

async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const doc = await httpHtml(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': 'https://duckduckgo.com/',
    },
  );
  const results: SearchResult[] = [];
  const elements = doc.querySelectorAll('.result');
  for (const el of Array.from(elements).slice(0, maxResults)) {
    const titleEl = el.querySelector('.result__title a') ?? el.querySelector('a');
    const snippetEl = el.querySelector('.result__snippet');
    const title = titleEl?.textContent?.trim() ?? '';
    const url = titleEl?.getAttribute('href') ?? '';
    const snippet = snippetEl?.textContent?.trim() ?? '';
    if (title && url) {
      let resolvedUrl = url;
      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        resolvedUrl = decodeURIComponent(uddgMatch[1]);
      } else if (url.startsWith('//')) {
        resolvedUrl = `https:${url}`;
      }
      results.push({ title, url: resolvedUrl, snippet });
    }
  }
  return results;
}

// ── Google Custom Search API ──

async function searchGoogle(query: string, maxResults: number, apiKey: string, cxId: string): Promise<SearchResult[]> {
  const data = await httpJson('GET',
    `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cxId)}&q=${encodeURIComponent(query)}&num=${maxResults}`,
    {},
  );
  return (data.items ?? []).map((item: { title: string; link: string; snippet: string }) => ({
    title: item.title ?? '',
    url: item.link ?? '',
    snippet: item.snippet ?? '',
  }));
}

// ── Bing Search API ──

async function searchBing(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const data = await httpJson('GET',
    `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
    { 'Ocp-Apim-Subscription-Key': apiKey },
  );
  return (data.webPages?.value ?? []).map((item: { name: string; url: string; snippet: string }) => ({
    title: item.name ?? '',
    url: item.url ?? '',
    snippet: item.snippet ?? '',
  }));
}

// ── Tavily Search API ──

async function searchTavily(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const data = await httpJson('POST', 'https://api.tavily.com/search',
    { 'Content-Type': 'application/json' },
    JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
  );
  return (data.results ?? []).map((item: { title: string; url: string; content: string }) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: item.content ?? '',
  }));
}

// ── Jina AI Search API ──

async function searchJina(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const data = await httpJson('POST', 'https://s.jina.ai/',
    { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'X-Retain-Images': 'none' },
    JSON.stringify({ q: query, num: maxResults }),
  );
  return (data.data ?? []).slice(0, maxResults).map((item: { title: string; url: string; description: string; content: string }) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: item.description ?? item.content?.slice(0, 200) ?? '',
  }));
}

// ── Exa Search API ──

async function searchExa(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const data = await httpJson('POST', 'https://api.exa.ai/search',
    { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    JSON.stringify({ query, numResults: maxResults, type: 'auto', contents: { text: { maxCharacters: 300 } } }),
  );
  return (data.results ?? []).slice(0, maxResults).map((item: { title: string; url: string; text: string }) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: item.text ?? '',
  }));
}

// ── SearXNG (自建) ──

async function searchSearXNG(query: string, maxResults: number, instanceUrl: string): Promise<SearchResult[]> {
  const base = instanceUrl.replace(/\/$/, '');
  const data = await httpJson('GET',
    `${base}/search?q=${encodeURIComponent(query)}&format=json&engines=google,bing,duckduckgo`,
    {},
  );
  return (data.results ?? []).slice(0, maxResults).map((item: { title: string; url: string; content: string }) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: item.content ?? '',
  }));
}

// ── Tool Registration ──

registerTool({
  id: 'web-search',
  name: i18n.t('tools.webSearch.name'),
  description: i18n.t('tools.webSearch.desc'),
  icon: '🔍',
  enabledByDefault: true,
  defaultConfig: () => ({
    engine: 'brave',
    apiKey: '',
    googleCxId: '',
    searxngUrl: '',
    maxResults: 5,
  }),
  ConfigForm: WebSearchConfigForm,
  createToolSpec: (config) => {
    const cfg = config as unknown as WebSearchConfig;
    return tool({
      description: 'Search the web for real-time information',
      inputSchema: zodSchema(
        z.object({
          query: z.string().describe('The search query'),
        }),
      ),
      execute: async ({ query }) => {
        try {
          let results: SearchResult[] = [];
          switch (cfg.engine) {
            case 'brave-api':
              results = await searchBraveApi(query, cfg.maxResults, cfg.apiKey);
              break;
            case 'duckduckgo':
              results = await searchDuckDuckGo(query, cfg.maxResults);
              break;
            case 'google':
              results = await searchGoogle(query, cfg.maxResults, cfg.apiKey, cfg.googleCxId);
              break;
            case 'bing':
              results = await searchBing(query, cfg.maxResults, cfg.apiKey);
              break;
            case 'tavily':
              results = await searchTavily(query, cfg.maxResults, cfg.apiKey);
              break;
            case 'jina':
              results = await searchJina(query, cfg.maxResults, cfg.apiKey);
              break;
            case 'exa':
              results = await searchExa(query, cfg.maxResults, cfg.apiKey);
              break;
            case 'searxng':
              results = await searchSearXNG(query, cfg.maxResults, cfg.searxngUrl);
              break;
            default:
              results = await searchBrave(query, cfg.maxResults);
          }
          const numbered = results.map((r, i) => ({ index: i + 1, ...r }));
          return {
            query,
            results: numbered,
            instruction: '回答时请在相关语句末尾用 [1]、[2] 等编号标注引用来源。',
          };
        } catch (e) {
          return { error: `搜索失败: ${e}` };
        }
      },
    });
  },
});
