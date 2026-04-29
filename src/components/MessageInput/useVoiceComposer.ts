import { useCallback, type RefObject } from 'react';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { getSettingValue } from '../../lib/apply-settings';

export function useVoiceComposer(opts: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  setText: (updater: string | ((prev: string) => string)) => void;
  handleSend: () => void;
}) {
  const { textareaRef, setText, handleSend } = opts;
  const { isRecording, isTranscribing, duration, toggleRecording, stopRecording, analyserRef } = useVoiceInput();

  const insertTranscript = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const current = textarea.value;
      const newText = current.substring(0, start) + text + current.substring(end);
      setText(newText);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();
      });
    } else {
      setText((prev) => prev + text);
    }

    if (getSettingValue('stt_auto_send') === '1') {
      requestAnimationFrame(() => {
        handleSend();
      });
    }
  }, [textareaRef, setText, handleSend]);

  const handleMicClick = useCallback(async () => {
    const text = await toggleRecording();
    if (text) insertTranscript(text);
  }, [toggleRecording, insertTranscript]);

  const handleSendWhileRecording = useCallback(async () => {
    const text = await stopRecording();
    if (text) insertTranscript(text);
  }, [stopRecording, insertTranscript]);

  return { isRecording, isTranscribing, duration, handleMicClick, handleSendWhileRecording, analyserRef };
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
