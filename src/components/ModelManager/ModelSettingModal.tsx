import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../ui/Dialog';
import { NativeInput } from '../ui/NativeInput';
import { NativeCheckbox } from '../ui/NativeCheckbox';
import { NativeSwitch } from '../ui/NativeSwitch';
import { NativeSelect } from '../ui/NativeSelect';
import { FormField } from '../Settings/FormField';
import { getDefaultCapabilities } from '../../lib/model-catalog';
import type { ThinkingCapability, ThinkingLevel } from '../../lib/model-capabilities';
import type { Model, ModelCapabilities, ImageGenerationSettings } from './types';

interface ModelSettingModalProps {
  model: Model | null;
  onClose: () => void;
  onSave: (model: Model) => void;
}

function CapGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-(--color-label-tertiary) mb-1.5">{label}</div>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

export function ModelSettingModal({ model, onClose, onSave }: ModelSettingModalProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Model | null>(null);

  const THINKING_LEVELS = useMemo<{ value: ThinkingLevel; label: string }[]>(() => [
    { value: 'low', label: t('model.low') },
    { value: 'medium', label: t('model.medium') },
    { value: 'high', label: t('model.high') },
  ], [t]);

  const current = draft ?? model;
  if (!current) return null;

  const caps = current.capabilities ?? {};

  const update = (patch: Partial<Model>) => {
    setDraft({ ...(draft ?? model!), ...patch });
  };

  const updateCap = (patch: Partial<ModelCapabilities>) => {
    update({ capabilities: { ...caps, ...patch } });
  };

  const imgSettings = current.imageSettings ?? {};

  const updateImgSettings = (patch: Partial<ImageGenerationSettings>) => {
    update({ imageSettings: { ...imgSettings, ...patch } });
  };

  const handleResetDefaults = () => {
    update({ capabilities: { ...getDefaultCapabilities(current.modelId) } });
  };

  const handleSave = () => {
    if (draft) onSave(draft);
    setDraft(null);
    onClose();
  };

  const handleCancel = () => {
    setDraft(null);
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) handleCancel();
  };

  // Thinking UI helpers
  const hasThinking = !!caps.thinking;
  const thinking = caps.thinking as ThinkingCapability | null | undefined;

  const toggleThinking = (enabled: boolean) => {
    if (enabled) {
      updateCap({
        thinking: { levels: ['high'], defaultLevel: 'high', canDisable: true },
      });
    } else {
      updateCap({ thinking: null });
    }
  };

  const updateThinking = (patch: Partial<ThinkingCapability>) => {
    if (!thinking) return;
    updateCap({ thinking: { ...thinking, ...patch } });
  };

  const toggleThinkingLevel = (level: ThinkingLevel, checked: boolean) => {
    if (!thinking) return;
    const levels = checked
      ? [...thinking.levels.filter((l) => l !== level), level]
      : thinking.levels.filter((l) => l !== level);
    // Keep at least one level
    if (levels.length === 0) return;
    const patch: Partial<ThinkingCapability> = { levels };
    if (!levels.includes(thinking.defaultLevel)) {
      patch.defaultLevel = levels[levels.length - 1];
    }
    updateThinking(patch);
  };

  return (
    <Dialog open={!!model} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[80vh] flex flex-col overflow-hidden">
        <DialogTitle>{t('model.settings')}</DialogTitle>

        <div className="mt-4 space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
          {/* 基本参数 */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('model.contextLength')}>
              <NativeInput
                type="number"
                placeholder={t('model.contextLengthPlaceholder')}
                value={current.contextLength ?? ''}
                onChange={(e) =>
                  update({ contextLength: e.target.value ? Number(e.target.value) : undefined })
                }
              />
            </FormField>
            <FormField label={t('model.maxOutputTokens')}>
              <NativeInput
                type="number"
                placeholder={t('model.maxOutputTokensPlaceholder')}
                value={current.maxOutputTokens ?? ''}
                onChange={(e) =>
                  update({ maxOutputTokens: e.target.value ? Number(e.target.value) : undefined })
                }
              />
            </FormField>
          </div>

          {/* 思考能力 */}
          <FormField label={t('model.thinking')}>
            <div className="flex flex-col gap-2">
              <NativeSwitch
                label={t('model.supportThinking')}
                checked={hasThinking}
                onChange={(e) => toggleThinking(e.target.checked)}
              />
              {hasThinking && thinking && (
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-(--color-label-secondary) shrink-0">{t('model.availableLevels')}</span>
                    <div className="flex gap-2">
                      {THINKING_LEVELS.map((l) => (
                        <NativeCheckbox
                          key={l.value}
                          label={l.label}
                          checked={thinking.levels.includes(l.value)}
                          onChange={(e) => toggleThinkingLevel(l.value, e.target.checked)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-(--color-label-secondary) shrink-0">{t('model.defaultLevel')}</span>
                    <NativeSelect
                      value={thinking.defaultLevel}
                      onChange={(e) => updateThinking({ defaultLevel: e.target.value as ThinkingLevel })}
                    >
                      {thinking.levels.map((l) => (
                        <option key={l} value={l}>
                          {THINKING_LEVELS.find((tl) => tl.value === l)?.label ?? l}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <NativeCheckbox
                    label={t('model.allowDisable')}
                    checked={thinking.canDisable}
                    onChange={(e) => updateThinking({ canDisable: e.target.checked })}
                  />
                </div>
              )}
            </div>
          </FormField>

          {/* 能力 */}
          <FormField label={t('model.capabilities')}>
            <div className="flex flex-col gap-3">
              <CapGroup label={t('model.inputModality')}>
                <NativeCheckbox
                  label={t('model.imageInput')}
                  checked={caps.supports_vision ?? false}
                  onChange={(e) => updateCap({ supports_vision: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.audioInput')}
                  checked={caps.supports_audio_input ?? false}
                  onChange={(e) => updateCap({ supports_audio_input: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.videoInput')}
                  checked={caps.supports_video_input ?? false}
                  onChange={(e) => updateCap({ supports_video_input: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.pdfInput')}
                  checked={caps.supports_pdf_input ?? false}
                  onChange={(e) => updateCap({ supports_pdf_input: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.fileInput')}
                  checked={caps.supports_file_input ?? false}
                  onChange={(e) => updateCap({ supports_file_input: e.target.checked })}
                />
              </CapGroup>

              <CapGroup label={t('model.outputModality')}>
                <NativeCheckbox
                  label={t('model.imageOutput')}
                  checked={caps.supports_image_output ?? false}
                  onChange={(e) => updateCap({ supports_image_output: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.audioOutput')}
                  checked={caps.supports_audio_output ?? false}
                  onChange={(e) => updateCap({ supports_audio_output: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.videoOutput')}
                  checked={caps.supports_video_output ?? false}
                  onChange={(e) => updateCap({ supports_video_output: e.target.checked })}
                />
              </CapGroup>

              {caps.supports_image_output && (
                <CapGroup label={t('model.imageGenParams')}>
                  <FormField label={t('model.size')}>
                    <NativeSelect
                      value={imgSettings.size ?? ''}
                      onChange={(e) => updateImgSettings({ size: e.target.value || undefined })}
                    >
                      <option value="">{t('model.auto')}</option>
                      <option value="1024x1024">1024x1024</option>
                      <option value="1536x1024">1536x1024 ({t('model.landscape')})</option>
                      <option value="1024x1536">1024x1536 ({t('model.portrait')})</option>
                      <option value="512x512">512x512</option>
                    </NativeSelect>
                  </FormField>
                  <FormField label={t('model.aspectRatio')}>
                    <NativeSelect
                      value={imgSettings.aspectRatio ?? ''}
                      onChange={(e) => updateImgSettings({ aspectRatio: e.target.value || undefined })}
                    >
                      <option value="">{t('model.auto')}</option>
                      <option value="1:1">1:1</option>
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                      <option value="4:3">4:3</option>
                      <option value="3:4">3:4</option>
                    </NativeSelect>
                  </FormField>
                  <FormField label={t('model.genCount')}>
                    <NativeSelect
                      value={String(imgSettings.n ?? 1)}
                      onChange={(e) => updateImgSettings({ n: Number(e.target.value) })}
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="4">4</option>
                    </NativeSelect>
                  </FormField>
                </CapGroup>
              )}

              <CapGroup label={t('model.features')}>
                <NativeCheckbox
                  label={t('model.functionCalling')}
                  checked={caps.supports_function_calling ?? false}
                  onChange={(e) => updateCap({ supports_function_calling: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.parallelFunctionCalling')}
                  checked={caps.supports_parallel_function_calling ?? false}
                  onChange={(e) => updateCap({ supports_parallel_function_calling: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.toolChoice')}
                  checked={caps.supports_tool_choice ?? false}
                  onChange={(e) => updateCap({ supports_tool_choice: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.streaming')}
                  checked={caps.supports_streaming ?? false}
                  onChange={(e) => updateCap({ supports_streaming: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.responseSchema')}
                  checked={caps.supports_response_schema ?? false}
                  onChange={(e) => updateCap({ supports_response_schema: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.webSearch')}
                  checked={caps.supports_web_search ?? false}
                  onChange={(e) => updateCap({ supports_web_search: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.codeExecution')}
                  checked={caps.supports_code_execution ?? false}
                  onChange={(e) => updateCap({ supports_code_execution: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.citations')}
                  checked={caps.supports_citations ?? false}
                  onChange={(e) => updateCap({ supports_citations: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.computerUse')}
                  checked={caps.supports_computer_use ?? false}
                  onChange={(e) => updateCap({ supports_computer_use: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.promptCaching')}
                  checked={caps.supports_prompt_caching ?? false}
                  onChange={(e) => updateCap({ supports_prompt_caching: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.assistantPrefill')}
                  checked={caps.supports_assistant_prefill ?? false}
                  onChange={(e) => updateCap({ supports_assistant_prefill: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.reasoning')}
                  checked={caps.supports_reasoning ?? false}
                  onChange={(e) => updateCap({ supports_reasoning: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.fimCompletion')}
                  checked={caps.supports_fim ?? false}
                  onChange={(e) => updateCap({ supports_fim: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.logProbs')}
                  checked={caps.supports_logprobs ?? false}
                  onChange={(e) => updateCap({ supports_logprobs: e.target.checked })}
                />
                <NativeCheckbox
                  label={t('model.systemMessages')}
                  checked={caps.supports_system_messages ?? false}
                  onChange={(e) => updateCap({ supports_system_messages: e.target.checked })}
                />
              </CapGroup>

              <CapGroup label={t('model.samplingParams')}>
                <NativeCheckbox
                  label={t('model.supportTemperature')}
                  checked={caps.supports_temperature ?? false}
                  onChange={(e) => updateCap({ supports_temperature: e.target.checked })}
                />
              </CapGroup>
            </div>
          </FormField>

        </div>

        <div className="flex justify-between pt-3 mt-3 border-t border-(--color-separator) shrink-0">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md text-(--color-label-secondary) hover:bg-(--color-fill) transition-colors"
          >
            <RotateCcw size={12} />
            {t('common.reset')}
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs rounded-md text-(--color-label-secondary) hover:bg-(--color-fill) transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs rounded-md bg-(--color-accent) text-white hover:bg-(--color-accent-hover) transition-colors"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
