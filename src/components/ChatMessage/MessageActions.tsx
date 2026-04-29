import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Copy, Check, Volume2, Play, Pause, Square } from 'lucide-react';
import Spinner from '../ui/Spinner';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export default function MessageActions({
  children,
  align = 'left',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className={`h-7 mt-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      {children}
    </div>
  );
}

export function ActionButton({
  icon,
  title,
  onClick,
}: {
  icon: ReactNode;
  title?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-(--color-fill-secondary) transition-colors text-(--color-label-secondary) hover:text-(--color-label)"
    >
      {icon}
    </button>
  );
}

export function PlayButton({
  text,
  voiceOutput,
}: {
  text: string;
  voiceOutput: { status: string; playingText: string; play: (text: string) => void; stop: () => void; pause: () => void; resume: () => void };
}) {
  const { t } = useTranslation();
  const { status, playingText, play, stop, pause, resume } = voiceOutput;

  // Only show active state if THIS message is the one being played
  const isActiveMessage = playingText === text;
  const effectiveStatus = isActiveMessage ? status : 'idle';

  const handleClick = () => {
    if (effectiveStatus === 'idle') play(text);
    else if (effectiveStatus === 'playing' || effectiveStatus === 'synthesizing') pause();
    else if (effectiveStatus === 'paused') resume();
  };

  const icon = (() => {
    if (effectiveStatus === 'synthesizing') return <Spinner className="w-3.5 h-3.5" />;
    if (effectiveStatus === 'playing') return <Pause className="w-3.5 h-3.5" />;
    if (effectiveStatus === 'paused') return <Play className="w-3.5 h-3.5" />;
    return <Volume2 className="w-3.5 h-3.5" />;
  })();

  const title = effectiveStatus === 'idle' ? t('chat.play') : effectiveStatus === 'paused' ? t('chat.resume') : t('chat.pause');

  return (
    <span className="inline-flex items-center gap-0.5">
      <ActionButton title={title} icon={icon} onClick={handleClick} />
      {effectiveStatus !== 'idle' && (
        <ActionButton title={t('chat.stopPlay')} icon={<Square className="w-3 h-3" />} onClick={stop} />
      )}
    </span>
  );
}

export function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  };

  return (
    <ActionButton
      title={t('common.copy')}
      icon={copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      onClick={handleCopy}
    />
  );
}
