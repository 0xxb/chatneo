import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/chat';
import { useModelStore } from '../../store/model';
import { getSettingValue } from '../../lib/apply-settings';
import SlashCommandPicker from './SlashCommandPicker';
import FileReferencePicker from './FileReferencePicker';
import PromptPreview, { replaceVariables, hasUnfilledVariables } from './PromptPreview';
import EditingBanner from './EditingBanner';
import AttachmentPreviewList from './AttachmentPreviewList';
import InputToolbar from './InputToolbar';
import { useInputPickers } from './useInputPickers';
import { useMessageInputState } from './useMessageInputState';
import { useAttachmentHandling } from './useAttachmentHandling';
import { useVoiceComposer } from './useVoiceComposer';
import { usePromptState } from './usePromptState';
import type { PromptRow } from '../../hooks/usePrompts';
import type { MessageInputProps } from './types';

export default function MessageInput({
  onSend,
  disabled = false,
  placeholder,
  onStop,
  onEditMessage,
  onClearMessages,
  inline = false,
}: MessageInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const isComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    editingMessageId, cancelEditMessage, pendingInput, hasMessages, resolvedCapabilities,
    thinkingLevel, setThinkingLevel, thinkingCap,
    selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds,
    selectedInstructionIds, setSelectedInstructionIds,
    webSearchEnabled, setWebSearchEnabled, webSearchAvailable,
  } = useMessageInputState();

  const { attachments, setAttachments, removeAttachment, showMenu, handlePaste } =
    useAttachmentHandling(resolvedCapabilities);

  // 用 ref 打破 usePromptState ↔ useInputPickers 的循环依赖
  const applyPromptRef = useRef<(prompt: PromptRow) => void>(() => {});
  const stableApplyPrompt = useCallback((prompt: PromptRow) => {
    applyPromptRef.current(prompt);
  }, []);

  const {
    slashPickerOpen, slashFilter, slashActiveIndex, slashCommands, handleSlashSelect,
    atPickerOpen, atActiveIndex, filteredAtFiles, atCaretCoords, handleAtSelect,
    handlePickerTextChange, handlePickerKeyDown,
    prompts,
  } = useInputPickers({
    textareaRef, text, setText, setAttachments, onClearMessages,
    applyPrompt: stableApplyPrompt,
  });

  const {
    selectedPrompt, variableValues, showVariableErrors, setShowVariableErrors,
    applyPrompt, clearPrompt, handleVariableChange,
  } = usePromptState(prompts);

  useLayoutEffect(() => {
    applyPromptRef.current = applyPrompt;
  }, [applyPrompt]);

  const isEditing = editingMessageId !== null;

  useEffect(() => {
    if (pendingInput) {
      setText(pendingInput);
      useModelStore.getState().setPendingInput(null);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [pendingInput]);

  useEffect(() => {
    if (!editingMessageId) return;
    const msg = useChatStore.getState().messages.find((m) => m.id === editingMessageId);
    if (msg) {
      setText(msg.content);
      if (msg.attachments?.length) {
        setAttachments(msg.attachments.map((a) => ({
          id: a.id, type: a.type, name: a.name, path: a.path, preview: a.preview,
        })));
      }
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [editingMessageId, setAttachments]);

  const handleTextChange = useCallback((value: string) => {
    setText(value);
    handlePickerTextChange(value);
  }, [handlePickerTextChange]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleSend = useCallback(() => {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (selectedPrompt && selectedPrompt.variables.length > 0 && hasUnfilledVariables(selectedPrompt, variableValues)) {
      setShowVariableErrors(true);
      return;
    }
    let finalText = trimmed;
    if (selectedPrompt?.content) {
      const promptContent = selectedPrompt.variables.length > 0
        ? replaceVariables(selectedPrompt.content, variableValues)
        : selectedPrompt.content;
      finalText = `${promptContent}\n\n${trimmed}`;
    }
    if (attachments.length > 0) {
      const attachmentNames = new Set(attachments.map((a) => a.name));
      finalText = finalText.replace(/@(\S+)/g, (match, name) => {
        return attachmentNames.has(name) ? '' : match;
      }).replace(/\s{2,}/g, ' ').trim();
    }
    if (isEditing && editingMessageId && onEditMessage) {
      onEditMessage(editingMessageId, finalText, attachments);
    } else {
      onSend?.({ text: finalText, attachments });
    }
    setText('');
    setAttachments([]);
    clearPrompt();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    requestAnimationFrame(() => textareaRef.current?.scrollIntoView({ block: 'end' }));
  }, [text, attachments, selectedPrompt, variableValues, onSend, isEditing, editingMessageId, onEditMessage, disabled, setAttachments, clearPrompt, setShowVariableErrors]);

  const { isRecording, isTranscribing, duration, handleMicClick, handleSendWhileRecording, analyserRef } =
    useVoiceComposer({ textareaRef, setText, handleSend });

  const cancelEditing = useCallback(() => {
    cancelEditMessage();
    setText('');
    setAttachments([]);
  }, [cancelEditMessage, setAttachments]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const composing = isComposingRef.current || e.nativeEvent.isComposing || e.keyCode === 229;
      if (handlePickerKeyDown(e, composing)) return;
      if (e.key === 'Escape' && isEditing) {
        e.preventDefault();
        cancelEditing();
        return;
      }
      const sendKey = getSettingValue('send_key') ?? 'Enter';
      if (sendKey === 'Cmd+Enter') {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !composing) {
          e.preventDefault();
          handleSend();
        }
      } else {
        if (e.key === 'Enter' && !e.shiftKey && !composing) {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [handleSend, isEditing, cancelEditing, handlePickerKeyDown],
  );

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  return (
    <div className={inline ? '' : 'px-4 pb-4 pt-2'}>
      {isEditing && <EditingBanner onCancel={cancelEditing} />}
      <div className="relative">
        <SlashCommandPicker
          commands={slashCommands}
          visible={slashPickerOpen}
          filter={slashFilter}
          activeIndex={slashActiveIndex}
          onSelect={handleSlashSelect}
        />
        <FileReferencePicker
          files={filteredAtFiles}
          visible={atPickerOpen}
          activeIndex={atActiveIndex}
          onSelect={handleAtSelect}
          caretCoords={atCaretCoords}
        />
        <div className={`chat-input-border rounded-2xl border bg-(--color-bg-control) overflow-hidden ${
          isEditing ? 'border-(--color-accent)' : 'border-(--color-separator)'
        }`}>
          {selectedPrompt && (
            <PromptPreview
              prompt={selectedPrompt}
              variableValues={variableValues}
              onVariableChange={handleVariableChange}
              onRemove={clearPrompt}
              showErrors={showVariableErrors}
            />
          )}
          <AttachmentPreviewList attachments={attachments} onRemove={removeAttachment} />
          <textarea
            ref={textareaRef}
            data-shortcut-input
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            placeholder={placeholder ?? t('chat.inputPlaceholder')}
            rows={1}
            className="w-full resize-none bg-transparent px-3 pt-3 pb-2 text-chat text-(--color-label) placeholder:text-(--color-label-tertiary) focus:outline-none"
          />
          <InputToolbar
            disabled={disabled}
            hasContent={hasContent}
            hasMessages={hasMessages}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            duration={duration}
            analyserRef={analyserRef}
            onStop={onStop}
            onMicClick={handleMicClick}
            onSend={handleSend}
            onSendWhileRecording={handleSendWhileRecording}
            onShowMenu={showMenu}
            onClearMessages={onClearMessages}
            prompts={prompts}
            selectedPrompt={selectedPrompt}
            onApplyPrompt={applyPrompt}
            onClearPrompt={clearPrompt}
            thinkingCap={thinkingCap}
            thinkingLevel={thinkingLevel}
            onThinkingLevelChange={setThinkingLevel}
            selectedKnowledgeBaseIds={selectedKnowledgeBaseIds}
            onKnowledgeBaseChange={setSelectedKnowledgeBaseIds}
            selectedInstructionIds={selectedInstructionIds}
            onInstructionChange={setSelectedInstructionIds}
            webSearchAvailable={webSearchAvailable}
            webSearchEnabled={webSearchEnabled}
            onWebSearchChange={setWebSearchEnabled}
          />
        </div>
      </div>
    </div>
  );
}
