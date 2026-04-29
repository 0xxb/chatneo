import { useTranslation } from 'react-i18next';
import { Brain } from 'lucide-react';
import { Menu, CheckMenuItem } from '@tauri-apps/api/menu';
import { Tooltip } from '../ui/Tooltip';
import { THINKING_LEVEL_LABELS, type ThinkingLevel, type ThinkingCapability } from '../../lib/model-capabilities';

export default function ThinkingButton({
  capability,
  level,
  onLevelChange,
}: {
  capability: ThinkingCapability | null;
  level: ThinkingLevel;
  onLevelChange: (level: ThinkingLevel) => void;
}) {
  const { t } = useTranslation();
  if (!capability) {
    return (
      <Tooltip content={t('chat.thinking')}>
        <button
          disabled
          className="w-7 h-7 flex items-center justify-center rounded-lg text-(--color-label-tertiary) opacity-40 cursor-not-allowed"
        >
          <Brain className="w-4 h-4" />
        </button>
      </Tooltip>
    );
  }

  const isActive = level !== 'off';
  const isMultiLevel = capability.levels.length > 1;

  if (!isMultiLevel) {
    const singleLevel = capability.levels[0];
    const handleClick = capability.canDisable
      ? () => onLevelChange(isActive ? 'off' : singleLevel)
      : undefined;

    return (
      <Tooltip content={t('chat.thinking')}>
        <button
          onClick={handleClick}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
            isActive
              ? 'text-(--color-accent) bg-(--color-accent)/10'
              : 'text-(--color-label-secondary) hover:bg-(--color-fill)'
          }`}
        >
          <Brain className="w-4 h-4" />
        </button>
      </Tooltip>
    );
  }

  const options: ThinkingLevel[] = capability.canDisable
    ? ['off', ...capability.levels]
    : [...capability.levels];

  const handleClick = async () => {
    const items = await Promise.all(
      options.map((opt) =>
        CheckMenuItem.new({
          text: THINKING_LEVEL_LABELS[opt],
          checked: level === opt,
          action: () => onLevelChange(opt),
        }),
      ),
    );
    const menu = await Menu.new({ items });
    menu.popup();
  };

  return (
    <Tooltip content={t('chat.thinking')}>
      <button
        onClick={handleClick}
        className={`h-7 flex items-center justify-center rounded-lg transition-colors gap-0.5 ${
          isActive
            ? 'text-(--color-accent) bg-(--color-accent)/10 px-1.5'
            : 'text-(--color-label-secondary) hover:bg-(--color-fill) w-7'
        }`}
      >
        <Brain className="w-4 h-4 shrink-0" />
        {isActive && (
          <span className="text-xs font-medium leading-none">{THINKING_LEVEL_LABELS[level]}</span>
        )}
      </button>
    </Tooltip>
  );
}
