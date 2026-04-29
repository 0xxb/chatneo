import { useState, useMemo, useCallback, type RefObject, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SquarePen, Trash2, ArrowLeftRight, MessageSquareQuote } from 'lucide-react';
import { useChatStore } from '../../store/chat';
import { useModelStore } from '../../store/model';
import { usePrompts, CATEGORY_I18N, type PromptRow } from '../../hooks/usePrompts';
import { useModels, type ModelItem } from '../../hooks/useModels';
import { filterCommands, type SlashCommand } from './SlashCommandPicker';
import { queryRecentAttachments, filterAttachments, type AttachmentRecord } from '../../lib/attachment-query';
import { getCaretCoords } from './getCaretCoords';
import type { Attachment } from './types';

interface UseInputPickersOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  text: string;
  setText: (v: string) => void;
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  onClearMessages?: () => void;
  applyPrompt: (prompt: PromptRow) => void;
}

export function useInputPickers({
  textareaRef,
  text,
  setText,
  setAttachments,
  onClearMessages,
  applyPrompt,
}: UseInputPickersOptions) {
  const { t } = useTranslation();

  // --- Slash picker state ---
  const [slashPickerOpen, setSlashPickerOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [slashModelMode, setSlashModelMode] = useState(false);

  // --- @ picker state ---
  const [atPickerOpen, setAtPickerOpen] = useState(false);
  const [atFilter, setAtFilter] = useState('');
  const [atActiveIndex, setAtActiveIndex] = useState(0);
  const [atFiles, setAtFiles] = useState<AttachmentRecord[]>([]);
  const [atCursorStart, setAtCursorStart] = useState(-1);
  const [atCaretCoords, setAtCaretCoords] = useState<{ top: number; left: number; height: number } | null>(null);

  // --- Data sources ---
  const { prompts } = usePrompts();
  const { models } = useModels();
  const newChat = useChatStore((s) => s.newChat);
  const setModel = useModelStore((s) => s.setModel);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const selectedProviderId = useModelStore((s) => s.selectedProviderId);

  // --- Build slash commands ---
  const builtinCommands: SlashCommand[] = useMemo(() => [
    {
      id: '__new',
      title: t('chat.newChat'),
      icon: <SquarePen className="w-3.5 h-3.5" />,
      category: t('chat.command'),
      data: { action: 'new' },
    },
    {
      id: '__clear',
      title: t('chat.clearMessages'),
      icon: <Trash2 className="w-3.5 h-3.5" />,
      category: t('chat.command'),
      data: { action: 'clear' },
    },
    {
      id: '__model',
      title: t('chat.switchModel'),
      icon: <ArrowLeftRight className="w-3.5 h-3.5" />,
      category: t('chat.command'),
      data: { action: 'model' },
    },
  ], [t]);

  const promptCommands: SlashCommand[] = useMemo(() => prompts.map((p) => ({
    id: p.id,
    title: p.title,
    icon: <MessageSquareQuote className="w-3.5 h-3.5" />,
    category: p.category && p.category in CATEGORY_I18N ? t(CATEGORY_I18N[p.category as keyof typeof CATEGORY_I18N]) : t('chat.promptLabel'),
    data: p,
  })), [prompts, t]);

  const modelCommands: SlashCommand[] = useMemo(() => models.map((m) => ({
    id: `__model:${m.providerId}:${m.modelId}`,
    title: m.modelName,
    icon: m.providerId === selectedProviderId && m.modelId === selectedModelId
      ? <span className="text-[11px]">✓</span>
      : null,
    category: `${m.providerIcon} ${m.providerName}`,
    data: m,
  })), [models, selectedProviderId, selectedModelId]);

  const slashCommands = useMemo(
    () => slashModelMode ? modelCommands : [...builtinCommands, ...promptCommands],
    [slashModelMode, modelCommands, builtinCommands, promptCommands],
  );

  // --- Slash handlers ---
  const closeSlashPicker = useCallback(() => {
    setText('');
    setSlashPickerOpen(false);
    setSlashFilter('');
    setSlashActiveIndex(0);
    setSlashModelMode(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [setText, textareaRef]);

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    if (slashModelMode) {
      const m = cmd.data as ModelItem;
      setModel(m.providerId, m.modelId);
      closeSlashPicker();
      return;
    }

    const action = (cmd.data as { action?: string })?.action;
    if (action === 'new') {
      newChat();
      closeSlashPicker();
    } else if (action === 'clear') {
      closeSlashPicker();
      onClearMessages?.();
    } else if (action === 'model') {
      setSlashModelMode(true);
      setSlashFilter('');
      setSlashActiveIndex(0);
      setText('/');
    } else {
      applyPrompt(cmd.data as PromptRow);
      closeSlashPicker();
    }
  }, [slashModelMode, applyPrompt, setModel, closeSlashPicker, newChat, onClearMessages, setText]);

  // --- @ handlers ---
  const closeAtPicker = useCallback(() => {
    setAtPickerOpen(false);
    setAtFilter('');
    setAtActiveIndex(0);
    setAtCursorStart(-1);
    setAtCaretCoords(null);
  }, []);

  const handleAtSelect = useCallback((file: AttachmentRecord) => {
    const before = text.slice(0, atCursorStart);
    const cursorPos = textareaRef.current?.selectionStart ?? text.length;
    const after = text.slice(cursorPos);
    const mention = `@${file.name} `;
    const newText = before + mention + after;
    setText(newText);

    setAttachments((prev) => {
      if (prev.some((a) => a.path === file.path)) return prev;
      return [...prev, {
        id: crypto.randomUUID(),
        type: file.type,
        name: file.name,
        path: file.path,
        preview: file.preview,
      }];
    });

    closeAtPicker();
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newCursorPos = before.length + mention.length;
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    });
  }, [text, atCursorStart, closeAtPicker, setText, setAttachments, textareaRef]);

  const filteredAtFiles = useMemo(() => filterAttachments(atFiles, atFilter), [atFiles, atFilter]);

  // --- Text change with picker detection ---
  const handlePickerTextChange = useCallback((value: string) => {
    if (slashModelMode) {
      if (value.startsWith('/')) {
        setSlashFilter(value.slice(1));
        setSlashActiveIndex(0);
      } else {
        setSlashPickerOpen(false);
        setSlashFilter('');
        setSlashActiveIndex(0);
        setSlashModelMode(false);
      }
      return;
    }
    if (value.startsWith('/')) {
      setSlashPickerOpen(true);
      setSlashFilter(value.slice(1));
      setSlashActiveIndex(0);
      if (atPickerOpen) closeAtPicker();
    } else {
      if (slashPickerOpen) {
        setSlashPickerOpen(false);
        setSlashFilter('');
        setSlashActiveIndex(0);
      }
    }

    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(^|[\s])@([^\s]*)$/);
    if (atMatch && !slashPickerOpen) {
      const keyword = atMatch[2];
      const atPos = textBeforeCursor.lastIndexOf('@');
      setAtCursorStart(atPos);
      setAtFilter(keyword);
      setAtActiveIndex(0);
      if (!atPickerOpen) {
        const ta = textareaRef.current;
        if (ta) {
          const raw = getCaretCoords(ta, atPos);
          setAtCaretCoords({
            top: raw.top + ta.offsetTop,
            left: raw.left + ta.offsetLeft,
            height: raw.height,
          });
        }
        queryRecentAttachments().then((files) => {
          const cur = textareaRef.current;
          if (!cur) return;
          const pos = cur.selectionStart ?? 0;
          const before = cur.value.slice(0, pos);
          if (!before.match(/(^|[\s])@([^\s]*)$/)) return;
          setAtFiles(files);
          setAtPickerOpen(true);
        });
      }
    } else if (atPickerOpen) {
      closeAtPicker();
    }
  }, [slashPickerOpen, slashModelMode, atPickerOpen, closeAtPicker, textareaRef]);

  // --- Keyboard navigation for pickers ---
  const handlePickerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>, isComposing: boolean): boolean => {
      if (slashPickerOpen && !isComposing) {
        const filtered = filterCommands(slashCommands, slashFilter);
        if (filtered.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSlashActiveIndex((i) => (i + 1) % filtered.length);
            return true;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSlashActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
            return true;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            handleSlashSelect(filtered[slashActiveIndex]);
            return true;
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          if (slashModelMode) {
            setSlashModelMode(false);
            setSlashFilter('');
            setSlashActiveIndex(0);
            setText('/');
          } else {
            setSlashPickerOpen(false);
            setSlashFilter('');
            setText('');
          }
          return true;
        }
      }

      if (atPickerOpen && !isComposing) {
        if (filteredAtFiles.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAtActiveIndex((i) => (i + 1) % filteredAtFiles.length);
            return true;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAtActiveIndex((i) => (i - 1 + filteredAtFiles.length) % filteredAtFiles.length);
            return true;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            handleAtSelect(filteredAtFiles[atActiveIndex]);
            return true;
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAtPicker();
          return true;
        }
      }

      return false;
    },
    [slashPickerOpen, slashFilter, slashActiveIndex, slashCommands, handleSlashSelect, slashModelMode, setText, atPickerOpen, filteredAtFiles, atActiveIndex, handleAtSelect, closeAtPicker],
  );

  return {
    // Slash picker
    slashPickerOpen,
    slashFilter,
    slashActiveIndex,
    slashCommands,
    handleSlashSelect,
    // @ picker
    atPickerOpen,
    atActiveIndex,
    filteredAtFiles,
    atCaretCoords,
    handleAtSelect,
    // Combined handlers
    handlePickerTextChange,
    handlePickerKeyDown,
    // Data
    prompts,
  };
}
