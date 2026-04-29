import { useRef, useCallback, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useContextMenu } from './useContextMenu';
import type { MenuDef } from './useContextMenu';
import type { Attachment } from '../components/MessageInput/types';
import type { ModelCapabilities } from '../lib/model-capabilities';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.includes(ext);
}

function parseName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

const menuDef: MenuDef = [
  { type: 'item', id: 'upload-file', text: '上传文件' },
  { type: 'item', id: 'upload-image', text: '上传照片' },
  { type: 'item', id: 'camera', text: '拍照', enabled: false },
  { type: 'separator' },
  { type: 'item', id: 'search', text: '搜索', enabled: false },
  { type: 'item', id: 'more', text: '更多', enabled: false },
];

async function pickFiles(
  imageOnly: boolean,
  onAttach: (attachments: Attachment[]) => void,
) {
  const filters = imageOnly
    ? [{ name: '图片', extensions: IMAGE_EXTENSIONS.filter((e) => e !== 'svg') }]
    : [];
  const selected = await open({
    multiple: true,
    filters: filters.length ? filters : undefined,
  });
  if (!selected) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  const attachments: Attachment[] = paths.map((p) => {
    const isImg = isImageFile(p);
    return {
      id: crypto.randomUUID(),
      type: isImg ? 'image' : 'file',
      name: parseName(p),
      path: p,
      preview: isImg ? convertFileSrc(p) : undefined,
    };
  });
  onAttach(attachments);
}

export function useAttachmentMenu(
  onAttach: (attachments: Attachment[]) => void,
  caps: ModelCapabilities = {},
) {
  const onAttachRef = useRef(onAttach);
  onAttachRef.current = onAttach;

  const supportsImage = caps.supports_vision === true;
  const supportsFile = caps.supports_file_input === true;

  const menu: MenuDef = useMemo(
    () =>
      menuDef.map((item) => {
        if (item.type !== 'item') return item;
        if ((item.id === 'upload-image' || item.id === 'camera') && !supportsImage) {
          return { ...item, enabled: false };
        }
        if (item.id === 'upload-file' && !supportsFile) {
          return { ...item, enabled: false };
        }
        return item;
      }),
    [supportsImage, supportsFile],
  );

  const show = useContextMenu(menu, (id) => {
    if (id === 'upload-file') {
      pickFiles(false, onAttachRef.current);
    }
    if (id === 'upload-image') pickFiles(true, onAttachRef.current);
  });

  return useCallback(
    (e: React.MouseEvent) => show(e, undefined as void),
    [show],
  );
}
