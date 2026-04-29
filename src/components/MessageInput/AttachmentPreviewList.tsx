import { X } from 'lucide-react';
import AttachmentTile from '../ui/AttachmentTile';
import type { Attachment } from './types';

function AttachmentPreviewItem({
  item,
  onRemove,
}: {
  item: Attachment;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="relative group shrink-0">
      <AttachmentTile type={item.type} name={item.name} url={item.preview} />
      <button
        onClick={() => onRemove(item.id)}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-(--color-bg-control) border border-(--color-separator) flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
      >
        <X className="w-3 h-3 text-(--color-label-secondary)" />
      </button>
    </div>
  );
}

export default function AttachmentPreviewList({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex gap-2 px-3 pt-3 pb-1 overflow-x-auto">
      {attachments.map((att) => (
        <AttachmentPreviewItem key={att.id} item={att} onRemove={onRemove} />
      ))}
    </div>
  );
}
