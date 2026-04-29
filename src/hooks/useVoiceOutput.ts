import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { getSettingValue } from '../lib/apply-settings';

type VoiceOutputStatus = 'idle' | 'synthesizing' | 'playing' | 'paused';

/** Strip markdown artifacts that shouldn't be spoken. */
function cleanTextForTts(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`[^`]+`/g, '')        // inline code
    .replace(/^#{1,6}\s+/gm, '')    // markdown headers
    .replace(/\n{2,}/g, '\n')       // collapse blank lines
    .trim();
}

export function useVoiceOutput() {
  const [status, setStatus] = useState<VoiceOutputStatus>('idle');
  const [playingText, setPlayingText] = useState('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const stoppedRef = useRef(false);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const initProvider = useCallback(async () => {
    const provider = getSettingValue('tts_provider') ?? 'sherpa';
    try {
      if (provider === 'sherpa') {
        const modelId = getSettingValue('tts_sherpa_model');
        if (!modelId) {
          toast.error('请先在设置中配置语音合成模型');
          return false;
        }
        await invoke('switch_tts_provider', {
          config: { provider_type: 'sherpa', model_id: modelId },
        });
      } else if (provider === 'openai') {
        const apiKey = getSettingValue('tts_openai_api_key');
        if (!apiKey) {
          toast.error('请先在设置中配置 TTS API Key');
          return false;
        }
        await invoke('switch_tts_provider', {
          config: {
            provider_type: 'openai',
            api_key: apiKey,
            base_url: getSettingValue('tts_openai_base_url') || 'https://api.openai.com',
            model_name: getSettingValue('tts_openai_model') || 'tts-1',
          },
        });
      }
      return true;
    } catch (e) {
      toast.error(`语音合成引擎初始化失败: ${e}`);
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        // already stopped
      }
      sourceNodeRef.current = null;
    }
    setStatus('idle');
    setPlayingText('');
  }, []);

  const play = useCallback(
    async (text: string) => {
      const ready = await initProvider();
      if (!ready) return;

      stop();
      stoppedRef.current = false;

      const cleaned = cleanTextForTts(text);
      if (!cleaned) return;

      setPlayingText(text);
      setStatus('synthesizing');

      const voice = getSettingValue('tts_openai_voice') || 'alloy';
      const speed = parseFloat(getSettingValue('tts_speed') || '1.0');

      let wavBytes: ArrayBuffer;
      try {
        wavBytes = await invoke<ArrayBuffer>('tts_synthesize', {
          text: cleaned,
          voice,
          speed,
        });
      } catch (e) {
        toast.error(`语音合成失败: ${e}`);
        setStatus('idle');
        return;
      }

      if (stoppedRef.current) return;

      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      let buffer: AudioBuffer;
      try {
        buffer = await ctx.decodeAudioData(wavBytes);
      } catch (e) {
        toast.error(`音频解码失败: ${e}`);
        setStatus('idle');
        return;
      }

      if (stoppedRef.current) return;

      setStatus('playing');
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      sourceNodeRef.current = source;
      source.onended = () => {
        sourceNodeRef.current = null;
        if (!stoppedRef.current) {
          setStatus('idle');
        }
      };
      source.start();
    },
    [initProvider, stop, getAudioContext],
  );

  const pause = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (ctx && status === 'playing') {
      await ctx.suspend();
      setStatus('paused');
    }
  }, [status]);

  const resume = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (ctx && status === 'paused') {
      await ctx.resume();
      setStatus('playing');
    }
  }, [status]);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch {
          // already stopped
        }
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  return useMemo(
    () => ({ status, playingText, play, stop, pause, resume }),
    [status, playingText, play, stop, pause, resume],
  );
}
