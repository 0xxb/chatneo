import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, ImageIcon, Video, Globe } from 'lucide-react';
import ProviderIcon from '../ProviderIcon';
import Spinner from '../ui/Spinner';

interface Props {
  providerIcon?: string;
  mediaType?: 'image' | 'video' | 'search';
  startTime?: number;
}

export default function LoadingMessage({ providerIcon, mediaType, startTime }: Props) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(() =>
    startTime ? Math.floor((Date.now() - startTime) / 1000) : 0
  );

  useEffect(() => {
    if (!mediaType || !startTime) return;
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [mediaType, startTime]);

  const icon = providerIcon && providerIcon !== 'default'
    ? <ProviderIcon icon={providerIcon} size={18} className="text-(--color-label-secondary)" />
    : <Bot className="w-4.5 h-4.5 text-(--color-label-secondary)" />;

  if (mediaType) {
    const MediaIcon = mediaType === 'image' ? ImageIcon : mediaType === 'video' ? Video : Globe;
    const label = mediaType === 'image' ? t('chat.generatingImage') : mediaType === 'video' ? t('chat.generatingVideo') : t('chat.searchingWeb');

    return (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-(--color-fill-secondary) flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex items-center gap-2 text-sm text-(--color-label-secondary)">
          <MediaIcon className="w-4 h-4" />
          <Spinner className="w-3.5 h-3.5" />
          <span>{label}</span>
          {elapsed > 0 && <span className="tabular-nums text-(--color-label-tertiary)">{elapsed}s</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-(--color-fill-secondary) flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-(--color-label-tertiary) animate-[pulse_1.4s_ease-in-out_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-(--color-label-tertiary) animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-(--color-label-tertiary) animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
      </div>
    </div>
  );
}
