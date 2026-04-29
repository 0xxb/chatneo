import { useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  ArrowUp,
  Square,
  Eraser,
  MessageSquareQuote,
  Mic,
  Loader2,
  Globe,
} from 'lucide-react';
import { Menu, CheckMenuItem } from '@tauri-apps/api/menu';
import { Tooltip } from '../ui/Tooltip';
import type { PromptRow } from '../../hooks/usePrompts';
import type { ThinkingLevel, ThinkingCapability } from '../../lib/model-capabilities';
import { useModelStore } from '../../store/model';
import ModelParamsButton from './ModelParamsButton';
import KnowledgeBaseButton from './KnowledgeBaseButton';
import InstructionButton from './InstructionButton';
import ThinkingButton from './ThinkingButton';
import VoiceSpectrum from './VoiceSpectrum';
import { formatDuration } from './useVoiceComposer';

interface InputToolbarProps {
  disabled: boolean;
  hasContent: boolean;
  hasMessages: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  duration: number;
  analyserRef: RefObject<AnalyserNode | null>;
  onStop?: () => void;
  onMicClick: () => void;
  onSend: () => void;
  onSendWhileRecording: () => void;
  onShowMenu: (e: React.MouseEvent) => void;
  onClearMessages?: () => void;
  // Prompt
  prompts: PromptRow[];
  selectedPrompt: PromptRow | null;
  onApplyPrompt: (p: PromptRow) => void;
  onClearPrompt: () => void;
  // Thinking
  thinkingCap: ThinkingCapability | null;
  thinkingLevel: ThinkingLevel;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  // Knowledge base
  selectedKnowledgeBaseIds: string[];
  onKnowledgeBaseChange: (ids: string[]) => void;
  // Instruction
  selectedInstructionIds: string[];
  onInstructionChange: (ids: string[]) => void;
  // Web search
  webSearchAvailable: boolean;
  webSearchEnabled: boolean;
  onWebSearchChange: (v: boolean) => void;
}

export default function InputToolbar({
  disabled,
  hasContent,
  hasMessages,
  isRecording,
  isTranscribing,
  duration,
  analyserRef,
  onStop,
  onMicClick,
  onSend,
  onSendWhileRecording,
  onShowMenu,
  onClearMessages,
  prompts,
  selectedPrompt,
  onApplyPrompt,
  onClearPrompt,
  thinkingCap,
  thinkingLevel,
  onThinkingLevelChange,
  selectedKnowledgeBaseIds,
  onKnowledgeBaseChange,
  selectedInstructionIds,
  onInstructionChange,
  webSearchAvailable,
  webSearchEnabled,
  onWebSearchChange,
}: InputToolbarProps) {
  const { t } = useTranslation();

  // Model params 直接从 store 读取，避免 prop drilling
  const temperature = useModelStore((s) => s.temperature);
  const setTemperature = useModelStore((s) => s.setTemperature);
  const maxOutputTokens = useModelStore((s) => s.maxOutputTokens);
  const setMaxOutputTokens = useModelStore((s) => s.setMaxOutputTokens);
  const topP = useModelStore((s) => s.topP);
  const setTopP = useModelStore((s) => s.setTopP);
  const topK = useModelStore((s) => s.topK);
  const setTopK = useModelStore((s) => s.setTopK);
  const frequencyPenalty = useModelStore((s) => s.frequencyPenalty);
  const setFrequencyPenalty = useModelStore((s) => s.setFrequencyPenalty);
  const presencePenalty = useModelStore((s) => s.presencePenalty);
  const setPresencePenalty = useModelStore((s) => s.setPresencePenalty);
  const stopSequences = useModelStore((s) => s.stopSequences);
  const setStopSequences = useModelStore((s) => s.setStopSequences);
  const seed = useModelStore((s) => s.seed);
  const setSeed = useModelStore((s) => s.setSeed);
  const resetModelParams = useModelStore((s) => s.resetModelParams);

  const showPromptMenu = useCallback(async () => {
    if (prompts.length === 0) {
      const items = [await import('@tauri-apps/api/menu').then(m => m.MenuItem.new({ text: t('chat.noPrompts'), enabled: false }))];
      const menu = await Menu.new({ items });
      menu.popup();
      return;
    }
    const items = await Promise.all(
      prompts.map((p) =>
        CheckMenuItem.new({
          text: p.title,
          checked: selectedPrompt?.id === p.id,
          action: () => {
            if (selectedPrompt?.id === p.id) {
              onClearPrompt();
            } else {
              onApplyPrompt(p);
            }
          },
        }),
      ),
    );
    const menu = await Menu.new({ items });
    menu.popup();
  }, [prompts, selectedPrompt, onApplyPrompt, onClearPrompt, t]);

  const handleSendClick = disabled
    ? onStop
    : isRecording
      ? onSendWhileRecording
      : hasContent
        ? onSend
        : undefined;

  return (
    <div className="flex items-center justify-between px-2 pb-2 gap-1">
      <div className="flex items-center gap-0.5 flex-1 min-w-0 relative">
        <div className={`flex items-center gap-0.5 transition-opacity duration-300 ${
          isRecording ? 'opacity-0 pointer-events-none absolute inset-0' : 'opacity-100'
        }`}>
          <button
            onClick={onShowMenu}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-(--color-fill) transition-colors text-(--color-label-secondary)"
          >
            <Plus className="w-4 h-4" />
          </button>
          <Tooltip content={t('chat.promptLabel')}>
            <button
              onClick={showPromptMenu}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                selectedPrompt
                  ? 'text-(--color-accent) bg-(--color-accent)/10'
                  : 'text-(--color-label-secondary) hover:bg-(--color-fill)'
              }`}
            >
              <MessageSquareQuote className="w-4 h-4" />
            </button>
          </Tooltip>
          <ThinkingButton
            capability={thinkingCap}
            level={thinkingLevel}
            onLevelChange={onThinkingLevelChange}
          />
          <KnowledgeBaseButton
            selectedIds={selectedKnowledgeBaseIds}
            onSelectionChange={onKnowledgeBaseChange}
          />
          <InstructionButton
            selectedIds={selectedInstructionIds}
            onSelectionChange={onInstructionChange}
          />
          {webSearchAvailable && (
            <Tooltip content={t('chat.webSearch')}>
              <button
                onClick={() => {
                  const next = !webSearchEnabled;
                  onWebSearchChange(next);
                }}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                  webSearchEnabled
                    ? 'text-(--color-accent) bg-(--color-accent)/10'
                    : 'text-(--color-label-secondary) hover:bg-(--color-fill)'
                }`}
              >
                <Globe className="w-4 h-4" />
              </button>
            </Tooltip>
          )}
          {hasMessages && onClearMessages && (
            <Tooltip content={t('chat.clearMessages')}>
              <button
                onClick={onClearMessages}
                disabled={disabled}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                  disabled
                    ? 'text-(--color-label-tertiary) opacity-40 cursor-not-allowed'
                    : 'text-(--color-label-secondary) hover:bg-(--color-fill)'
                }`}
              >
                <Eraser className="w-4 h-4" />
              </button>
            </Tooltip>
          )}
          <ModelParamsButton
            temperature={temperature}
            maxOutputTokens={maxOutputTokens}
            topP={topP}
            topK={topK}
            frequencyPenalty={frequencyPenalty}
            presencePenalty={presencePenalty}
            stopSequences={stopSequences}
            seed={seed}
            onTemperatureChange={setTemperature}
            onMaxOutputTokensChange={setMaxOutputTokens}
            onTopPChange={setTopP}
            onTopKChange={setTopK}
            onFrequencyPenaltyChange={setFrequencyPenalty}
            onPresencePenaltyChange={setPresencePenalty}
            onStopSequencesChange={setStopSequences}
            onSeedChange={setSeed}
            onReset={resetModelParams}
          />
        </div>
        {isRecording && (
          <VoiceSpectrum analyserRef={analyserRef} />
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {isTranscribing ? (
          <button className="w-7 h-7 flex items-center justify-center rounded-lg text-(--color-accent)">
            <Loader2 className="w-4 h-4 animate-spin" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            {isRecording && (
              <span className="text-xs text-(--color-accent) tabular-nums">
                {formatDuration(duration)}
              </span>
            )}
            <button
              onClick={onMicClick}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                isRecording
                  ? 'text-(--color-accent) bg-(--color-accent)/10'
                  : 'text-(--color-label-secondary) hover:bg-(--color-fill)'
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>
        )}
        <button
          onClick={handleSendClick}
          className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
            disabled || hasContent || isRecording
              ? 'bg-(--color-accent) text-white hover:bg-(--color-accent-hover)'
              : 'bg-(--color-fill-secondary) text-(--color-label-tertiary)'
          }`}
        >
          {disabled ? (
            <Square className="w-3.5 h-3.5" />
          ) : (
            <ArrowUp className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
