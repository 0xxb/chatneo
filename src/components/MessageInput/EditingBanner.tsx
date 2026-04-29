import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

export default function EditingBanner({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between px-3 py-1.5 mb-1 rounded-lg bg-(--color-accent)/10 text-xs text-(--color-accent)">
      <span>{t('chat.editingMessage')}</span>
      <button
        onClick={onCancel}
        className="flex items-center gap-1 hover:text-(--color-accent-hover) transition-colors"
      >
        <X className="w-3 h-3" />
        {t('common.cancel')}
      </button>
    </div>
  );
}
