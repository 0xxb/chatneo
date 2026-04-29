import { useState, useCallback, type ClipboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@tauri-apps/plugin-dialog';
import { useAttachmentMenu } from '../../hooks/useAttachmentMenu';
import type { ModelCapabilities } from '../../lib/model-capabilities';
import type { Attachment } from './types';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function useAttachmentHandling(resolvedCapabilities: ModelCapabilities) {
  const { t } = useTranslation();
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addAttachments = useCallback((items: Attachment[]) => {
    setAttachments((prev) => [...prev, ...items]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const showMenu = useAttachmentMenu(addAttachments, resolvedCapabilities);

  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles = Array.from(items)
        .filter((i) => i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => f !== null);
      if (imageFiles.length === 0) return;
      e.preventDefault();
      if (resolvedCapabilities.supports_vision !== true) {
        message(t('chat.imageNotSupported'), { title: t('common.notice'), kind: 'info' });
        return;
      }
      const results = await Promise.all(
        imageFiles.map(async (file) => ({
          id: crypto.randomUUID(),
          type: 'image' as const,
          name: file.name || t('chat.pastedImage'),
          path: '',
          preview: await fileToBase64(file),
        })),
      );
      addAttachments(results);
    },
    [addAttachments, resolvedCapabilities, t],
  );

  return { attachments, setAttachments, addAttachments, removeAttachment, showMenu, handlePaste };
}
