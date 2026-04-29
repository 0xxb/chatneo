import { useTranslation } from 'react-i18next';
import { PhotoView } from 'react-photo-view';
import { getAttachmentUrl } from '../../lib/attachments';

interface GeneratedImageProps {
  path: string;
  revisedPrompt?: string;
}

export default function GeneratedImage({ path, revisedPrompt }: GeneratedImageProps) {
  const { t } = useTranslation();
  const url = getAttachmentUrl(path);

  return (
    <div className="shrink-0 inline-block max-w-[200px]">
      <PhotoView src={url}>
        <img
          src={url}
          alt={revisedPrompt ?? t('chat.generatedImage')}
          className="rounded-lg max-w-full h-auto cursor-pointer"
          loading="lazy"
        />
      </PhotoView>
      {revisedPrompt && (
        <p className="mt-1 text-xs text-(--color-label-tertiary) line-clamp-2">{revisedPrompt}</p>
      )}
    </div>
  );
}
