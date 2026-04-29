import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Image } from 'lucide-react';
import type { AttachmentRecord } from '../../lib/attachment-query';
import type { CaretCoords } from './getCaretCoords';
import { useDropDirection } from '../../hooks/useDropDirection';

interface FileReferencePickerProps {
  files: AttachmentRecord[];
  visible: boolean;
  activeIndex: number;
  onSelect: (file: AttachmentRecord) => void;
  caretCoords: CaretCoords | null;
}

export default function FileReferencePicker({
  files,
  visible,
  activeIndex,
  onSelect,
  caretCoords,
}: FileReferencePickerProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const { containerRef, dropDown } = useDropDirection(visible);

  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!visible || !caretCoords) return null;

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    left: caretCoords.left,
    ...(dropDown
      ? { top: caretCoords.top + caretCoords.height, marginTop: 4 }
      : { top: caretCoords.top, transform: 'translateY(-100%)', marginTop: -4 }),
    minWidth: 240,
    maxWidth: 320,
  };

  return (
    <div ref={containerRef} style={dropdownStyle} className="z-10">
      <div className="chat-popover rounded-lg border border-(--color-separator) bg-(--color-bg-popover) backdrop-blur-xl overflow-hidden shadow-lg">
        {files.length === 0 ? (
          <div className="px-3 py-3 text-[13px] text-(--color-label-tertiary) text-center">
            {t('chat.noRecentFiles')}
          </div>
        ) : (
          <>
            <div className="px-2 py-1.5 text-[11px] text-(--color-label-tertiary) border-b border-(--color-separator)">
              {t('chat.selectFile')}
            </div>
            <div ref={listRef} className="max-h-48 overflow-auto p-1 space-y-0.5">
              {files.map((file, i) => (
                <button
                  key={file.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(file);
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] transition-colors ${
                    i === activeIndex
                      ? 'bg-(--color-accent) text-white'
                      : 'text-(--color-label) hover:bg-(--color-fill-secondary)'
                  }`}
                >
                  <span className="w-4 h-4 shrink-0 flex items-center justify-center opacity-60">
                    {file.type === 'image' ? (
                      <Image className="w-3.5 h-3.5" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <span className="truncate flex-1" title={file.name}>{file.name}</span>
                  <span className={`text-[11px] shrink-0 ${
                    i === activeIndex ? 'text-white/60' : 'text-(--color-label-tertiary)'
                  }`}>
                    {file.type === 'image' ? t('chat.fileTypeImage') : t('chat.fileTypeFile')}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
