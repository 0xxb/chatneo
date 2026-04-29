import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { SettingGroup, SettingRow } from '../../components/Settings/SettingGroup';
import { NativeSelect, NativeInput, NativeSwitch } from '../../components/ui/native';
import { useSettings } from '../../hooks/useSettings';
import { useTauriEvent } from '../../hooks/useTauriEvent';
import { toast } from 'sonner';

interface ModelInfo {
  id: string;
  name: string;
  size: string;
  description: string;
  downloaded: boolean;
}

interface DownloadProgress {
  model_id: string;
  progress: number;
  status: string;
  error?: string;
}

export default function VoiceSettings() {
  const { settings, loading, setSetting } = useSettings();
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [downloading, setDownloading] = useState<Record<string, number>>({});
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [ttsModels, setTtsModels] = useState<ModelInfo[]>([]);
  const [ttsDownloading, setTtsDownloading] = useState<Record<string, number>>({});
  const [ttsApiKey, setTtsApiKey] = useState<string | null>(null);

  useEffect(() => {
    invoke<ModelInfo[]>('stt_get_available_models').then(setModels).catch(() => {});
  }, []);

  useEffect(() => {
    invoke<ModelInfo[]>('tts_get_available_models').then(setTtsModels).catch(() => {});
  }, []);

  const initProvider = useCallback(async (providerType: string, modelId?: string, overrides?: Record<string, string>) => {
    try {
      if (providerType === 'whisper') {
        const mid = modelId ?? settings.stt_whisper_model;
        if (!mid) return;
        await invoke('switch_stt_provider', {
          config: { provider_type: 'whisper', model_id: mid },
        });
      } else if (providerType === 'openai') {
        const key = overrides?.api_key ?? settings.stt_openai_api_key;
        if (!key) return;
        await invoke('switch_stt_provider', {
          config: {
            provider_type: 'openai',
            api_key: key,
            base_url: overrides?.base_url ?? (settings.stt_openai_base_url || 'https://api.openai.com'),
            model_name: overrides?.model_name ?? (settings.stt_openai_model || 'whisper-1'),
          },
        });
      }
    } catch (e) {
      toast.error(`初始化失败: ${e}`);
    }
  }, [settings.stt_whisper_model, settings.stt_openai_api_key, settings.stt_openai_base_url, settings.stt_openai_model]);

  // Use ref so the event listener always calls the latest initProvider
  const initProviderRef = useRef(initProvider);
  initProviderRef.current = initProvider;

  const sttProviderRef = useRef(settings.stt_provider);
  sttProviderRef.current = settings.stt_provider;

  useTauriEvent<DownloadProgress>('stt-download-progress', ({ payload }) => {
    if (payload.status === 'completed') {
      setDownloading((prev) => {
        const next = { ...prev };
        delete next[payload.model_id];
        return next;
      });
      invoke<ModelInfo[]>('stt_get_available_models').then(setModels).catch(() => {});
      initProviderRef.current(sttProviderRef.current ?? 'whisper', payload.model_id);
    } else if (payload.status === 'error') {
      setDownloading((prev) => {
        const next = { ...prev };
        delete next[payload.model_id];
        return next;
      });
      toast.error(payload.error ?? '下载失败');
    } else {
      setDownloading((prev) => ({ ...prev, [payload.model_id]: payload.progress }));
    }
  });

  const handleDownload = async (modelId: string) => {
    setDownloading((prev) => ({ ...prev, [modelId]: 0 }));
    try {
      await invoke('stt_download_model', { modelId });
    } catch (e) {
      setDownloading((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      toast.error(`下载失败: ${e}`);
    }
  };

  useTauriEvent<DownloadProgress>('tts-download-progress', ({ payload }) => {
    if (payload.status === 'completed') {
      setTtsDownloading((prev) => {
        const next = { ...prev };
        delete next[payload.model_id];
        return next;
      });
      invoke<ModelInfo[]>('tts_get_available_models').then(setTtsModels).catch(() => {});
    } else if (payload.status === 'error') {
      setTtsDownloading((prev) => {
        const next = { ...prev };
        delete next[payload.model_id];
        return next;
      });
      toast.error(payload.error ?? '下载失败');
    } else {
      setTtsDownloading((prev) => ({ ...prev, [payload.model_id]: payload.progress }));
    }
  });

  const handleTtsDownload = async (modelId: string) => {
    setTtsDownloading((prev) => ({ ...prev, [modelId]: 0 }));
    try {
      await invoke('tts_download_model', { modelId });
    } catch (e) {
      setTtsDownloading((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      toast.error(`下载失败: ${e}`);
    }
  };

  const handleSelectModelFile = async () => {
    const path = await open({
      filters: [{ name: 'Whisper Model', extensions: ['bin'] }],
    });
    if (path) {
      await setSetting('stt_whisper_custom_model', path as string);
      try {
        await invoke('switch_stt_provider', {
          config: { provider_type: 'whisper', model_path: path },
        });
        toast.success('模型加载成功');
      } catch (e) {
        toast.error(`模型加载失败: ${e}`);
      }
    }
  };

  if (loading) return null;

  const provider = settings.stt_provider ?? 'whisper';
  const apiKeyValue = apiKey ?? settings.stt_openai_api_key ?? '';
  const ttsProvider = settings.tts_provider ?? 'sherpa';
  const ttsApiKeyValue = ttsApiKey ?? settings.tts_openai_api_key ?? '';

  return (
    <div className="max-w-2xl mx-auto p-5 space-y-4">
      <SettingGroup title={t('settings.voice.provider')}>
        <SettingRow label={t('settings.voice.provider')} desc={t('settings.voice.providerDesc')}>
          <NativeSelect
            value={provider}
            onChange={(e) => {
              setSetting('stt_provider', e.target.value);
              initProvider(e.target.value);
            }}
          >
            <option value="whisper">{t('settings.voice.whisperLocal')}</option>
            <option value="openai">{t('settings.voice.openaiCompatible')}</option>
          </NativeSelect>
        </SettingRow>
      </SettingGroup>

      {provider === 'whisper' && (
        <SettingGroup title={t('settings.voice.model')}>
          {models.map((model) => (
            <SettingRow
              key={model.id}
              label={`${model.name} (${model.size})`}
              desc={model.description}
            >
              {downloading[model.id] !== undefined ? (
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-(--color-fill-secondary) rounded-full overflow-hidden">
                    <div
                      className="h-full bg-(--color-accent) rounded-full transition-all"
                      style={{ width: `${Math.round(downloading[model.id] * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-(--color-label-secondary) tabular-nums w-8">
                    {Math.round(downloading[model.id] * 100)}%
                  </span>
                </div>
              ) : model.downloaded ? (
                <button
                  onClick={async () => {
                    await setSetting('stt_whisper_model', model.id);
                    await setSetting('stt_whisper_custom_model', '');
                    initProvider('whisper', model.id);
                  }}
                  className={`text-[12px] px-2 py-0.5 rounded ${
                    settings.stt_whisper_model === model.id && !settings.stt_whisper_custom_model
                      ? 'bg-(--color-accent) text-white'
                      : 'bg-(--color-fill-secondary) text-(--color-label-secondary) hover:bg-(--color-fill)'
                  }`}
                >
                  {settings.stt_whisper_model === model.id && !settings.stt_whisper_custom_model ? '✓ 使用中' : '使用'}
                </button>
              ) : (
                <button
                  onClick={() => handleDownload(model.id)}
                  className="text-[12px] px-2 py-0.5 rounded bg-(--color-accent) text-white hover:bg-(--color-accent-hover)"
                >
                  {t('settings.voice.download')}
                </button>
              )}
            </SettingRow>
          ))}
          <SettingRow
            label={t('settings.voice.customModelPath')}
            desc={settings.stt_whisper_custom_model || t('settings.voice.notConfigured')}
          >
            <div className="flex items-center gap-1.5">
              {settings.stt_whisper_custom_model && (
                <button
                  onClick={async () => {
                    await setSetting('stt_whisper_custom_model', '');
                    const modelId = settings.stt_whisper_model;
                    if (modelId) initProvider('whisper', modelId);
                  }}
                  className="text-[12px] px-2 py-0.5 rounded text-(--color-destructive) bg-(--color-fill-secondary) hover:bg-(--color-fill)"
                >
                  清除
                </button>
              )}
              <button
                onClick={handleSelectModelFile}
                className="text-[12px] px-2 py-0.5 rounded bg-(--color-fill-secondary) text-(--color-label-secondary) hover:bg-(--color-fill)"
              >
                {t('settings.voice.selectFile')}
              </button>
            </div>
          </SettingRow>
        </SettingGroup>
      )}

      {provider === 'openai' && (
        <SettingGroup title="OpenAI">
          <SettingRow label={t('settings.voice.baseUrl')} desc={t('settings.voice.baseUrlDesc')}>
            <NativeInput
              value={settings.stt_openai_base_url ?? 'https://api.openai.com'}
              onChange={(e) => setSetting('stt_openai_base_url', e.target.value)}
              onBlur={() => initProvider('openai')}
              style={{ width: 200 }}
            />
          </SettingRow>
          <SettingRow label={t('settings.voice.apiKey')} desc={t('settings.voice.apiKeyDesc')}>
            <NativeInput
              type="password"
              value={apiKeyValue}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => {
                if (apiKey !== null) {
                  setSetting('stt_openai_api_key', apiKey);
                  initProvider('openai', undefined, { api_key: apiKey });
                  setApiKey(null);
                }
              }}
              style={{ width: 200 }}
            />
          </SettingRow>
          <SettingRow label={t('settings.voice.modelName')} desc={t('settings.voice.modelNameDesc')}>
            <NativeInput
              value={settings.stt_openai_model ?? 'whisper-1'}
              onChange={(e) => setSetting('stt_openai_model', e.target.value)}
              onBlur={() => initProvider('openai')}
              style={{ width: 200 }}
            />
          </SettingRow>
        </SettingGroup>
      )}

      <SettingGroup title={t('settings.voice.language')}>
        <SettingRow label={t('settings.voice.language')} desc={t('settings.voice.languageDesc')}>
          <NativeSelect
            value={settings.stt_language ?? 'zh'}
            onChange={(e) => setSetting('stt_language', e.target.value)}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </NativeSelect>
        </SettingRow>
        <SettingRow label={t('settings.voice.autoSend')} desc={t('settings.voice.autoSendDesc')}>
          <NativeSwitch
            checked={settings.stt_auto_send === '1'}
            onChange={(e) => setSetting('stt_auto_send', e.target.checked ? '1' : '0')}
          />
        </SettingRow>
      </SettingGroup>

      <div className="border-t border-(--color-separator) pt-4 mt-2" />

      <SettingGroup title={t('settings.voice.ttsProvider')}>
        <SettingRow label={t('settings.voice.ttsProvider')} desc={t('settings.voice.ttsProviderDesc')}>
          <NativeSelect
            value={ttsProvider}
            onChange={(e) => setSetting('tts_provider', e.target.value)}
          >
            <option value="sherpa">{t('settings.voice.sherpaLocal')}</option>
            <option value="openai">{t('settings.voice.openaiCompatible')}</option>
          </NativeSelect>
        </SettingRow>
      </SettingGroup>

      {ttsProvider === 'sherpa' && (
        <SettingGroup title={t('settings.voice.ttsModel')}>
          {ttsModels.map((model) => (
            <SettingRow
              key={model.id}
              label={`${model.name} (${model.size})`}
              desc={model.description}
            >
              {ttsDownloading[model.id] !== undefined ? (
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-(--color-fill-secondary) rounded-full overflow-hidden">
                    <div
                      className="h-full bg-(--color-accent) rounded-full transition-all"
                      style={{ width: `${Math.round(ttsDownloading[model.id] * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-(--color-label-secondary) tabular-nums w-8">
                    {Math.round(ttsDownloading[model.id] * 100)}%
                  </span>
                </div>
              ) : model.downloaded ? (
                <button
                  onClick={() => setSetting('tts_sherpa_model', model.id)}
                  className={`text-[12px] px-2 py-0.5 rounded ${
                    settings.tts_sherpa_model === model.id
                      ? 'bg-(--color-accent) text-white'
                      : 'bg-(--color-fill-secondary) text-(--color-label-secondary) hover:bg-(--color-fill)'
                  }`}
                >
                  {settings.tts_sherpa_model === model.id ? '✓ 使用中' : '使用'}
                </button>
              ) : (
                <button
                  onClick={() => handleTtsDownload(model.id)}
                  className="text-[12px] px-2 py-0.5 rounded bg-(--color-accent) text-white hover:bg-(--color-accent-hover)"
                >
                  {t('settings.voice.download')}
                </button>
              )}
            </SettingRow>
          ))}
        </SettingGroup>
      )}

      {ttsProvider === 'openai' && (
        <SettingGroup title="OpenAI TTS">
          <SettingRow label={t('settings.voice.baseUrl')} desc={t('settings.voice.ttsBaseUrlDesc')}>
            <NativeInput
              value={settings.tts_openai_base_url ?? 'https://api.openai.com'}
              onChange={(e) => setSetting('tts_openai_base_url', e.target.value)}
              style={{ width: 200 }}
            />
          </SettingRow>
          <SettingRow label={t('settings.voice.apiKey')} desc={t('settings.voice.ttsApiKeyDesc')}>
            <NativeInput
              type="password"
              value={ttsApiKeyValue}
              onChange={(e) => setTtsApiKey(e.target.value)}
              onBlur={() => {
                if (ttsApiKey !== null) {
                  setSetting('tts_openai_api_key', ttsApiKey);
                  setTtsApiKey(null);
                }
              }}
              style={{ width: 200 }}
            />
          </SettingRow>
          <SettingRow label={t('settings.voice.modelName')} desc={t('settings.voice.ttsModelNameDesc')}>
            <NativeInput
              value={settings.tts_openai_model ?? 'tts-1'}
              onChange={(e) => setSetting('tts_openai_model', e.target.value)}
              style={{ width: 200 }}
            />
          </SettingRow>
          <SettingRow label={t('settings.voice.ttsVoice')} desc={t('settings.voice.ttsVoiceDesc')}>
            <NativeSelect
              value={settings.tts_openai_voice ?? 'alloy'}
              onChange={(e) => setSetting('tts_openai_voice', e.target.value)}
            >
              <option value="alloy">Alloy</option>
              <option value="echo">Echo</option>
              <option value="fable">Fable</option>
              <option value="onyx">Onyx</option>
              <option value="nova">Nova</option>
              <option value="shimmer">Shimmer</option>
            </NativeSelect>
          </SettingRow>
        </SettingGroup>
      )}

      <SettingGroup title={t('settings.voice.ttsPlayback')}>
        <SettingRow label={t('settings.voice.ttsSpeed')} desc={t('settings.voice.ttsSpeedDesc')}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={parseFloat(settings.tts_speed ?? '1.0')}
              onChange={(e) => setSetting('tts_speed', e.target.value)}
              className="w-24 accent-(--color-accent)"
            />
            <span className="text-[11px] text-(--color-label-secondary) tabular-nums w-8">
              {parseFloat(settings.tts_speed ?? '1.0').toFixed(1)}x
            </span>
          </div>
        </SettingRow>
        <SettingRow label={t('settings.voice.ttsAutoRead')} desc={t('settings.voice.ttsAutoReadDesc')}>
          <NativeSwitch
            checked={settings.tts_auto_read === '1'}
            onChange={(e) => setSetting('tts_auto_read', e.target.checked ? '1' : '0')}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
