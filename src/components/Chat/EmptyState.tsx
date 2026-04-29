import { useTranslation } from 'react-i18next';

export default function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center h-full">
      <h1 className="text-lg font-medium text-(--color-label-quaternary)">
        {t('chat.emptyState')}
      </h1>
    </div>
  );
}
