import { PhotoView } from 'react-photo-view';
import { getFileExtension } from '../../lib/attachments';

interface AttachmentTileProps {
  type: 'image' | 'file';
  name: string;
  url?: string;
  className?: string;
  previewable?: boolean;
}

export default function AttachmentTile({ type, name, url, className = 'w-16 h-16', previewable = false }: AttachmentTileProps) {
  const imageElement = (
    <img src={url} alt={name} className={`w-full h-full object-cover ${previewable ? 'cursor-pointer' : ''}`} />
  );

  return (
    <div className={`rounded-lg border border-(--color-separator) overflow-hidden relative ${className}`}>
      {type === 'image' ? (
        previewable && url ? (
          <PhotoView src={url}>
            {imageElement}
          </PhotoView>
        ) : (
          imageElement
        )
      ) : (
        <div className="w-full h-full bg-(--color-fill) flex items-center justify-center">
          <span className="text-sm font-semibold text-(--color-label-tertiary)">
            {getFileExtension(name)}
          </span>
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5">
        <span className="text-xs text-white truncate block" title={name}>{name}</span>
      </div>
    </div>
  );
}
