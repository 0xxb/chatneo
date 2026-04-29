import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import i18n from '../locales';

async function handleDownload(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const path = await save({ defaultPath: filename });

    if (path) {
      await writeFile(path, new Uint8Array(arrayBuffer));
      toast.success(i18n.t('common.downloadSuccess'));
    }
  } catch {
    toast.error(i18n.t('common.downloadFailed'));
  }
}

export function setupDownloadInterceptor() {
  document.addEventListener('click', async (e) => {
    const link = (e.target as HTMLElement).closest('a');

    if (link?.href && link.download) {
      e.preventDefault();
      await handleDownload(link.href, link.download || link.href.split('/').pop() || 'download');
    }
  }, true);
}
