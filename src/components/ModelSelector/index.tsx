import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Brain, Eye, Image, Video, Wrench, Globe } from 'lucide-react';
import { SearchableSelect, SelectGroup, SelectOption, SelectEmpty } from '../ui/SearchableSelect';
import { Badge } from '../ui/Badge';
import ProviderIcon from '../ProviderIcon';
import { useModels } from '../../hooks/useModels';
import { resolveCapabilities } from '../../lib/model-capabilities';
import { splitModelName } from '../../lib/utils';
import type { Model, ModelCaps, TabType } from './types';

interface ModelSelectorProps {
  providerId?: number | null;
  modelId?: string | null;
  onChange?: (providerId: number, modelId: string) => void;
  // 对比模式
  comparisonModel?: { providerId: number; modelId: string } | null;
  onComparisonChange?: (model: { providerId: number; modelId: string } | null) => void;
}

export default function ModelSelector({
  providerId, modelId, onChange,
  comparisonModel, onComparisonChange,
}: ModelSelectorProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabType>('all');
  const { models: rawModels, toggleFavorite } = useModels();

  const models: Model[] = useMemo(
    () => rawModels.map((m) => {
      const c = resolveCapabilities(m.capabilities, m.modelId);
      return {
        modelId: m.modelId,
        name: m.modelName,
        providerId: m.providerId,
        providerName: m.providerName,
        providerIcon: m.providerIcon,
        favorited: m.favorited,
        caps: {
          thinking: !!c.thinking,
          vision: !!c.supports_vision,
          imageOutput: !!c.supports_image_output,
          videoOutput: !!c.supports_video_output,
          functionCalling: !!c.supports_function_calling,
          webSearch: !!c.supports_web_search,
        },
      };
    }),
    [rawModels],
  );

  const selectedModel = models.find((m) => m.providerId === providerId && m.modelId === modelId);
  const comparisonModelData = comparisonModel
    ? models.find((m) => m.providerId === comparisonModel.providerId && m.modelId === comparisonModel.modelId)
    : null;
  const selectedSplit = selectedModel ? splitModelName(selectedModel.name) : undefined;
  const favCount = models.filter((m) => m.favorited).length;
  const isComparisonMode = !!comparisonModel;

  const handleToggleFavorite = useCallback((pid: number, mid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(pid, mid);
  }, [toggleFavorite]);

  const tabs = useMemo(
    () => [
      { key: 'all', label: t('model.all') },
      { key: 'favorites', label: `${t('model.favorites')}${favCount > 0 ? ` ${favCount}` : ''}` },
    ],
    [favCount, t],
  );

  const displayValue = isComparisonMode && comparisonModelData
    ? `${selectedSplit?.base ?? '?'} vs ${splitModelName(comparisonModelData.name).base}`
    : selectedSplit?.base ?? t('model.selectModel');

  return (
    <SearchableSelect
      displayValue={displayValue}
      displayTrailing={
        isComparisonMode
          ? <Badge variant="outline" className="ml-1">{t('model.comparison')}</Badge>
          : selectedSplit?.variant ? <Badge variant="outline">{selectedSplit.variant}</Badge> : undefined
      }
      placeholder={t('model.searchModel')}
      tabs={tabs}
      activeTab={tab}
      onTabChange={(key) => setTab(key as TabType)}
    >
      {({ search, close }) => (
        <>
          <ModelList
            models={models}
            tab={tab}
            search={search}
            selectedProviderId={providerId ?? null}
            selectedModelId={modelId ?? null}
            comparisonModel={comparisonModel ?? null}
            onSelect={(pid, mid, _caps, shiftKey) => {
              // Shift+点击 → 对比模式
              if (shiftKey && providerId && modelId) {
                const isSameAsPrimary = pid === providerId && mid === modelId;
                if (isSameAsPrimary) { close(); return; }

                const isSameAsComparison = comparisonModel
                  && pid === comparisonModel.providerId && mid === comparisonModel.modelId;
                if (isSameAsComparison) {
                  onComparisonChange?.(null);
                } else {
                  onComparisonChange?.({ providerId: pid, modelId: mid });
                }
                close();
                return;
              }

              // 普通点击 → 切换模型，退出对比
              if (comparisonModel) onComparisonChange?.(null);
              onChange?.(pid, mid);
              close();
            }}
            onToggleFavorite={handleToggleFavorite}
          />
          <div className="px-2.5 pb-1 text-[10px] leading-none text-(--color-label-tertiary) text-center">
            {t('model.shiftClickCompare')}
          </div>
        </>
      )}
    </SearchableSelect>
  );
}

function ModelList({
  models,
  tab,
  search,
  selectedProviderId,
  selectedModelId,
  comparisonModel,
  onSelect,
  onToggleFavorite,
}: {
  models: Model[];
  tab: TabType;
  search: string;
  selectedProviderId: number | null;
  selectedModelId: string | null;
  comparisonModel: { providerId: number; modelId: string } | null;
  onSelect: (providerId: number, modelId: string, caps: ModelCaps, shiftKey: boolean) => void;
  onToggleFavorite: (providerId: number, modelId: string, e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const grouped = useMemo(() => {
    let list = models;
    if (tab === 'favorites') list = list.filter((m) => m.favorited);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.providerName.toLowerCase().includes(q),
      );
    }
    const map = new Map<string, Model[]>();
    for (const m of list) {
      const key = `${m.providerId}:${m.providerName}`;
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return map;
  }, [models, tab, search]);

  if (grouped.size === 0) return <SelectEmpty text={t('model.noMatch')} />;

  return (
    <>
      {[...grouped.entries()].map(([key, list]) => (
        <SelectGroup key={key} label={list[0].providerName} icon={<ProviderIcon icon={list[0].providerIcon} size={12} />}>
          {list.map((m) => {
            const isPrimary = m.providerId === selectedProviderId && m.modelId === selectedModelId;
            const isComparison = comparisonModel
              ? m.providerId === comparisonModel.providerId && m.modelId === comparisonModel.modelId
              : false;
            const isSelected = isPrimary || isComparison;
            const { base, variant } = splitModelName(m.name);
            return (
              <SelectOption
                key={`${m.providerId}:${m.modelId}`}
                selected={isSelected}
                onClick={(e) => onSelect(m.providerId, m.modelId, m.caps, e.shiftKey)}
                trailing={
                  <div className="flex items-center gap-1">
                    {isComparison && <Badge variant="outline" className="text-[10px] px-1 py-0 border-white/30 text-white/80">VS</Badge>}
                    {variant && (
                      <Badge variant={isSelected ? 'outline' : 'secondary'} className={isSelected ? 'border-white/30 text-white/80' : ''}>
                        {variant}
                      </Badge>
                    )}
                    <CapabilityIcons caps={m.caps} selected={isSelected} />
                    <FavoriteStar
                      favorited={m.favorited}
                      selected={isSelected}
                      onClick={(e) => onToggleFavorite(m.providerId, m.modelId, e)}
                    />
                  </div>
                }
              >
                {base}
              </SelectOption>
            );
          })}
        </SelectGroup>
      ))}
    </>
  );
}

function CapabilityIcons({ caps, selected }: { caps: ModelCaps; selected: boolean }) {
  const { t } = useTranslation();

  const CAP_ICONS = useMemo(() => [
    { key: 'thinking' as const, Icon: Brain, title: t('model.deepThinking') },
    { key: 'vision' as const, Icon: Eye, title: t('model.imageRecognition') },
    { key: 'imageOutput' as const, Icon: Image, title: t('model.imageGeneration') },
    { key: 'videoOutput' as const, Icon: Video, title: t('model.videoOutput') },
    { key: 'functionCalling' as const, Icon: Wrench, title: t('model.functionCalling') },
    { key: 'webSearch' as const, Icon: Globe, title: t('model.webSearch') },
  ], [t]);

  const active = CAP_ICONS.filter(({ key }) => caps[key]);
  if (active.length === 0) return null;
  return (
    <div className="flex items-center gap-0.5">
      {active.map(({ key, Icon, title }) => (
        <span key={key} title={title}>
          <Icon
            size={13}
            className={`shrink-0 ${selected ? 'text-white/70' : 'text-(--color-label-tertiary)'}`}
          />
        </span>
      ))}
    </div>
  );
}

function FavoriteStar({
  favorited,
  selected,
  onClick,
}: {
  favorited?: boolean;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <Star
      size={14}
      onClick={onClick}
      className={`shrink-0 transition-colors ${
        favorited
          ? selected
            ? 'fill-white text-white'
            : 'fill-amber-400 text-amber-400'
          : selected
            ? 'text-white/50 hover:text-white'
            : 'text-transparent group-hover:text-(--color-label-tertiary) hover:text-amber-400!'
      }`}
    />
  );
}
