import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { registerTool, type ToolFormProps } from '../lib/tool-registry';
import { FormField } from '../components/Settings/FormField';
import { NativeSelect, NativeInput } from '../components/ui/native';
import i18n from '../locales';

interface TranslatorConfig {
  provider: string;
  apiKey: string;
  baiduAppId: string;
  defaultTarget: string;
}

function TranslatorConfigForm({ config, onSave }: ToolFormProps) {
  const { t } = useTranslation();
  const cfg = config as unknown as TranslatorConfig;

  const update = (patch: Partial<TranslatorConfig>) => onSave({ ...cfg, ...patch });

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-(--color-label-tertiary)">{t('tools.translator.configDesc')}</p>
      <FormField label={t('tools.translator.provider')}>
        <NativeSelect value={cfg.provider} onChange={(e) => update({ provider: e.target.value })}>
          <option value="ai">{t('tools.translator.providerAI')}</option>
          <option value="deepl">{t('tools.translator.providerDeepL')}</option>
          <option value="google">{t('tools.translator.providerGoogle')}</option>
          <option value="baidu">{t('tools.translator.providerBaidu')}</option>
        </NativeSelect>
      </FormField>
      {(cfg.provider === 'deepl' || cfg.provider === 'google') && (
        <FormField label={t('tools.translator.apiKey')}>
          <NativeInput
            type="password"
            value={cfg.apiKey}
            placeholder={t('tools.translator.apiKeyPlaceholder')}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
        </FormField>
      )}
      {cfg.provider === 'baidu' && (
        <>
          <FormField label={t('tools.translator.baiduAppId')}>
            <NativeInput
              value={cfg.baiduAppId}
              placeholder={t('tools.translator.baiduAppIdPlaceholder')}
              onChange={(e) => update({ baiduAppId: e.target.value })}
            />
          </FormField>
          <FormField label={t('tools.translator.apiKey')}>
            <NativeInput
              type="password"
              value={cfg.apiKey}
              placeholder={t('tools.translator.apiKeyPlaceholder')}
              onChange={(e) => update({ apiKey: e.target.value })}
            />
          </FormField>
        </>
      )}
      <FormField label={t('tools.translator.defaultTarget')}>
        <NativeSelect value={cfg.defaultTarget} onChange={(e) => update({ defaultTarget: e.target.value })}>
          <option value="zh">中文 (zh)</option>
          <option value="en">English (en)</option>
          <option value="ja">日本語 (ja)</option>
          <option value="ko">한국어 (ko)</option>
          <option value="fr">Français (fr)</option>
          <option value="de">Deutsch (de)</option>
          <option value="es">Español (es)</option>
          <option value="ru">Русский (ru)</option>
        </NativeSelect>
      </FormField>
    </div>
  );
}

interface TranslationResult {
  original: string;
  translated: string;
  source_language: string;
  target_language: string;
}

async function translateDeepL(text: string, targetLang: string, apiKey: string): Promise<TranslationResult> {
  const resp = await invoke<{ status: number; body: string }>('tool_http_request', {
    method: 'POST',
    url: 'https://api-free.deepl.com/v2/translate',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: [text], target_lang: targetLang.toUpperCase() }),
  });
  const data = JSON.parse(resp.body);
  const tr = data.translations?.[0] ?? {};
  return {
    original: text,
    translated: tr.text ?? '',
    source_language: tr.detected_source_language?.toLowerCase() ?? 'unknown',
    target_language: targetLang,
  };
}

async function translateGoogle(text: string, targetLang: string, apiKey: string): Promise<TranslationResult> {
  const resp = await invoke<{ status: number; body: string }>('tool_http_request', {
    method: 'POST',
    url: `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target: targetLang, format: 'text' }),
  });
  const data = JSON.parse(resp.body);
  const tr = data.data?.translations?.[0] ?? {};
  return {
    original: text,
    translated: tr.translatedText ?? '',
    source_language: tr.detectedSourceLanguage ?? 'unknown',
    target_language: targetLang,
  };
}

// Simple MD5 implementation for Baidu API signing
function md5(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  // MD5 constants
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const K = Array.from({length:64},(_,i)=>Math.floor(2**32*Math.abs(Math.sin(i+1)))>>>0);
  const pad = new Uint8Array(((utf8.length+9+63)&~63));
  pad.set(utf8); pad[utf8.length]=0x80;
  const dv = new DataView(pad.buffer);
  dv.setUint32(pad.length-8, (utf8.length*8)>>>0, true);
  dv.setUint32(pad.length-4, Math.floor(utf8.length*8/2**32)>>>0, true);
  let [a0,b0,c0,d0] = [0x67452301,0xEFCDAB89,0x98BADCFE,0x10325476];
  for(let i=0;i<pad.length;i+=64){
    let [A,B,C,D]=[a0,b0,c0,d0];
    for(let j=0;j<64;j++){
      let F:number,g:number;
      if(j<16){F=(B&C)|((~B)&D);g=j;}
      else if(j<32){F=(D&B)|((~D)&C);g=(5*j+1)%16;}
      else if(j<48){F=B^C^D;g=(3*j+5)%16;}
      else{F=C^(B|(~D));g=(7*j)%16;}
      F=(F+A+K[j]+dv.getUint32(i+g*4,true))>>>0;
      A=D;D=C;C=B;B=(B+((F<<S[j])|(F>>>(32-S[j]))))>>>0;
    }
    a0=(a0+A)>>>0;b0=(b0+B)>>>0;c0=(c0+C)>>>0;d0=(d0+D)>>>0;
  }
  return [a0,b0,c0,d0].map(v=>{
    const h=v.toString(16).padStart(8,'0');
    return h.match(/../g)!.reverse().join('');
  }).join('');
}

async function translateBaidu(text: string, targetLang: string, appId: string, apiKey: string): Promise<TranslationResult> {
  const salt = Date.now().toString();
  const sign = md5(`${appId}${text}${salt}${apiKey}`);
  const params = new URLSearchParams({
    q: text, from: 'auto', to: targetLang === 'zh' ? 'zh' : targetLang,
    appid: appId, salt, sign,
  });
  const resp = await invoke<{ status: number; body: string }>('tool_http_request', {
    method: 'GET',
    url: `https://fanyi-api.baidu.com/api/trans/vip/translate?${params.toString()}`,
    headers: {},
    body: null,
  });
  const data = JSON.parse(resp.body);
  const results = data.trans_result ?? [];
  return {
    original: text,
    translated: results.map((r: { dst: string }) => r.dst).join('\n'),
    source_language: data.from ?? 'unknown',
    target_language: data.to ?? targetLang,
  };
}

registerTool({
  id: 'translator',
  name: i18n.t('tools.translator.name'),
  description: i18n.t('tools.translator.desc'),
  icon: '🌍',
  enabledByDefault: true,
  defaultConfig: () => ({
    provider: 'ai',
    apiKey: '',
    baiduAppId: '',
    defaultTarget: 'zh',
  }),
  ConfigForm: TranslatorConfigForm,
  createToolSpec: (config) => {
    const cfg = config as unknown as TranslatorConfig;
    return tool({
      description: 'Translate text to a target language',
      inputSchema: zodSchema(
        z.object({
          text: z.string().describe('The text to translate'),
          targetLanguage: z
            .string()
            .optional()
            .describe('Target language code (e.g. zh, en, ja). Uses default if not specified.'),
        }),
      ),
      execute: async ({ text, targetLanguage }) => {
        const target = targetLanguage ?? cfg.defaultTarget;
        try {
          switch (cfg.provider) {
            case 'deepl':
              return await translateDeepL(text, target, cfg.apiKey);
            case 'google':
              return await translateGoogle(text, target, cfg.apiKey);
            case 'baidu':
              return await translateBaidu(text, target, cfg.baiduAppId, cfg.apiKey);
            default:
              // AI model handles the translation
              return {
                instruction: `Please translate the following text to ${target}. Return only the translated text without any explanation.`,
                original: text,
                target_language: target,
              };
          }
        } catch (e) {
          return { error: `翻译失败: ${e}` };
        }
      },
    });
  },
});
