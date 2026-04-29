import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { registerTool, type ToolFormProps } from '../lib/tool-registry';
import { FormField } from '../components/Settings/FormField';
import { NativeSelect, NativeInput } from '../components/ui/native';
import i18n from '../locales';

interface WeatherConfig {
  provider: string;
  apiKey: string;
}

function WeatherConfigForm({ config, onSave }: ToolFormProps) {
  const { t } = useTranslation();
  const cfg = config as unknown as WeatherConfig;

  const update = (patch: Partial<WeatherConfig>) => onSave({ ...cfg, ...patch });

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-(--color-label-tertiary)">{t('tools.weather.configDesc')}</p>
      <FormField label={t('tools.weather.provider')}>
        <NativeSelect value={cfg.provider} onChange={(e) => update({ provider: e.target.value })}>
          <option value="wttr">wttr.in</option>
          <option value="openweathermap">OpenWeatherMap</option>
        </NativeSelect>
      </FormField>
      {cfg.provider === 'openweathermap' && (
        <FormField label={t('tools.weather.apiKey')}>
          <NativeInput
            type="password"
            value={cfg.apiKey}
            placeholder={t('tools.weather.apiKeyPlaceholder')}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
        </FormField>
      )}
    </div>
  );
}

interface WeatherResult {
  city: string;
  temperature: string;
  condition: string;
  humidity: string;
  wind: string;
}

async function fetchWttr(city: string): Promise<WeatherResult> {
  const resp = await invoke<{ status: number; body: string }>('tool_http_request', {
    method: 'GET',
    url: `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
    headers: { 'User-Agent': 'curl/7.0' },
    body: null,
  });
  const data = JSON.parse(resp.body);
  const current = data.current_condition?.[0] ?? {};
  const desc = current.lang_zh?.[0]?.value ?? current.weatherDesc?.[0]?.value ?? '';
  return {
    city,
    temperature: `${current.temp_C ?? '?'}°C`,
    condition: desc,
    humidity: `${current.humidity ?? '?'}%`,
    wind: `${current.windspeedKmph ?? '?'} km/h`,
  };
}

async function fetchOpenWeatherMap(city: string, apiKey: string): Promise<WeatherResult> {
  const resp = await invoke<{ status: number; body: string }>('tool_http_request', {
    method: 'GET',
    url: `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${encodeURIComponent(apiKey)}&units=metric&lang=zh_cn`,
    headers: {},
    body: null,
  });
  const data = JSON.parse(resp.body);
  return {
    city: data.name ?? city,
    temperature: `${data.main?.temp ?? '?'}°C`,
    condition: data.weather?.[0]?.description ?? '',
    humidity: `${data.main?.humidity ?? '?'}%`,
    wind: `${data.wind?.speed ?? '?'} m/s`,
  };
}

registerTool({
  id: 'weather',
  name: i18n.t('tools.weather.name'),
  description: i18n.t('tools.weather.desc'),
  icon: '⛅',
  enabledByDefault: true,
  defaultConfig: () => ({
    provider: 'wttr',
    apiKey: '',
  }),
  ConfigForm: WeatherConfigForm,
  createToolSpec: (config) => {
    const cfg = config as unknown as WeatherConfig;
    return tool({
      description: 'Get current weather information for a city',
      inputSchema: zodSchema(
        z.object({
          city: z.string().describe('The city name to query weather for'),
        }),
      ),
      execute: async ({ city }) => {
        try {
          if (cfg.provider === 'openweathermap') {
            return await fetchOpenWeatherMap(city, cfg.apiKey);
          }
          return await fetchWttr(city);
        } catch (e) {
          return { error: `天气查询失败: ${e}` };
        }
      },
    });
  },
});
