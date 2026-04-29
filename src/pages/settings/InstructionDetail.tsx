import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../components/Settings/FormField';
import { NativeInput } from '../../components/ui/native';
import type { InstructionOutletContext } from './InstructionSettings';

export default function InstructionDetail() {
  const { t } = useTranslation();
  const { instruction, updateField } = useOutletContext<InstructionOutletContext>();

  const [title, setTitle] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);

  const titleValue = title ?? instruction.title;
  const contentValue = content ?? instruction.content;

  return (
    <div className="p-4 space-y-4" key={instruction.id}>
      <FormField label={t('instruction.name')}>
        <NativeInput
          value={titleValue}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== null && title.trim()) {
              updateField('title', title.trim());
              setTitle(null);
            } else {
              setTitle(null);
            }
          }}
          placeholder={t('instruction.namePlaceholder')}
        />
      </FormField>
      <FormField label={t('instruction.content')} desc={t('instruction.contentHint')}>
        <textarea
          value={contentValue}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => {
            if (content !== null) {
              updateField('content', content);
              setContent(null);
            }
          }}
          placeholder={t('instruction.contentPlaceholder')}
          rows={10}
          className="w-full resize-none rounded-md border border-(--color-separator) bg-(--color-bg-control) px-2.5 py-2 text-[13px] text-(--color-label) placeholder:text-(--color-label-tertiary) focus:outline-none focus:border-(--color-accent)"
        />
      </FormField>
    </div>
  );
}
