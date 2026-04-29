import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { getSettingValue } from '../lib/apply-settings';

interface TranscriptResult {
  text: string;
}

export function useVoiceInput() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
    };
  }, []);

  const initProvider = useCallback(async () => {

    const provider = getSettingValue('stt_provider') ?? 'whisper';
    try {
      if (provider === 'whisper') {
        const modelId = getSettingValue('stt_whisper_model');
        const customModel = getSettingValue('stt_whisper_custom_model');
        if (customModel) {
          await invoke('switch_stt_provider', {
            config: { provider_type: 'whisper', model_path: customModel },
          });
        } else if (modelId) {
          await invoke('switch_stt_provider', {
            config: { provider_type: 'whisper', model_id: modelId },
          });
        } else {
          toast.error('请先在设置中配置语音识别引擎');
          return false;
        }
      } else if (provider === 'openai') {
        const apiKey = getSettingValue('stt_openai_api_key');
        if (!apiKey) {
          toast.error('请先在设置中配置 API Key');
          return false;
        }
        await invoke('switch_stt_provider', {
          config: {
            provider_type: 'openai',
            api_key: apiKey,
            base_url: getSettingValue('stt_openai_base_url') || 'https://api.openai.com',
            model_name: getSettingValue('stt_openai_model') || 'whisper-1',
          },
        });
      }
      return true;
    } catch (e) {
      toast.error(`语音引擎初始化失败: ${e}`);
      return false;
    }
  }, []);

  const startRecording = useCallback(async () => {
    const ready = await initProvider();
    if (!ready) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch {
      toast.error('无法访问麦克风，请检查权限设置');
    }
  }, [initProvider]);

  const cleanupAudio = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        cleanupAudio();
        if (mountedRef.current) setIsRecording(false);
        resolve('');
        return;
      }

      // Stop timer and analyser immediately for UI, but keep stream alive until recorder finishes
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      analyserRef.current = null;

      recorder.onstop = async () => {
        // Now safe to stop stream tracks after recorder captured final data
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (mountedRef.current) setIsRecording(false);

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        if (blob.size < 5000) {
          resolve('');
          return;
        }

        if (mountedRef.current) setIsTranscribing(true);
        try {
          const buffer = await blob.arrayBuffer();
          const result = await invoke<TranscriptResult>(
            'transcribe_audio',
            new Uint8Array(buffer),
            { headers: { 'Content-Type': 'application/octet-stream' } },
          );
          if (mountedRef.current) setIsTranscribing(false);
          resolve(result.text);
        } catch (e) {
          if (mountedRef.current) setIsTranscribing(false);
          toast.error(`转录失败: ${e}`);
          resolve('');
        }
      };

      recorder.stop();
    });
  }, [cleanupAudio]);

  const toggleRecording = useCallback(async (): Promise<string> => {
    if (isRecording) {
      return stopRecording();
    }
    await startRecording();
    return '';
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isTranscribing,
    duration,
    toggleRecording,
    stopRecording,
    analyserRef,
  };
}
