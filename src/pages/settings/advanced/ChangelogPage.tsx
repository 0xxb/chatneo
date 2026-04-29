import { useTranslation } from 'react-i18next';
import MarkdownPage from './MarkdownPage';

export default function ChangelogPage() {
  const { t } = useTranslation();
  return <MarkdownPage src="/CHANGELOG.md" emptyText={t('settings.changelog.empty')} />;
}
