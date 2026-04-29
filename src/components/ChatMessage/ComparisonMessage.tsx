import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import AssistantMessage from './AssistantMessage';
import ErrorMessage from './ErrorMessage';
import type { ChatMessageData } from './types';
import ProviderIcon from '../ProviderIcon';

export interface ComparisonModel {
  providerId: number;
  modelId: string;
  modelName: string;
  providerIcon: string;
}

interface ComparisonMessageProps {
  models: [ComparisonModel, ComparisonModel];
  messages: [ChatMessageData, ChatMessageData];
  allFinished: boolean;
  onAdopt: (index: 0 | 1) => void;
}

const ERROR_PREFIX = '**Error:**';

export default function ComparisonMessage({ models, messages, allFinished, onAdopt }: ComparisonMessageProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-3">
      {([0, 1] as const).map((i) => {
        const msg = messages[i];
        const isError = msg.content.startsWith(ERROR_PREFIX);
        const isEmpty = !msg.content && !msg.thinking && !msg.toolCalls?.length;
        const isLoading = isEmpty && !allFinished;

        return (
          <div key={`${models[i].providerId}:${models[i].modelId}`} className="flex flex-col min-w-0">
            {/* 模型标识 */}
            <div className="flex items-center gap-1.5 px-1 py-1.5 text-xs font-medium text-(--color-label-secondary)">
              <ProviderIcon icon={models[i].providerIcon} size={14} />
              <span className="truncate">{models[i].modelName}</span>
            </div>

            {/* 回答内容 */}
            <div className="flex-1 rounded-xl border border-(--color-separator) p-1 overflow-hidden">
              {isLoading ? (
                <div className="flex items-center gap-1 px-3 py-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-(--color-label-tertiary) animate-[pulse_1.4s_ease-in-out_infinite]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-(--color-label-tertiary) animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-(--color-label-tertiary) animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                </div>
              ) : isError ? (
                <ErrorMessage message={{ ...msg, content: msg.content.slice(ERROR_PREFIX.length).trim(), role: 'error' }} />
              ) : (
                <AssistantMessage
                  message={msg}
                  providerIcon={models[i].providerIcon}
                />
              )}
            </div>

            {/* 采纳按钮 */}
            {allFinished && !isError && (
              <button
                onClick={() => onAdopt(i)}
                className="mt-2 mx-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-(--color-label-secondary) hover:bg-(--color-fill-secondary) hover:text-(--color-label) transition-colors"
              >
                <Check size={14} />
                {t('chat.adopt')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
