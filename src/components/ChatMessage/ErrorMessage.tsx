import { useMemo } from 'react';
import type { ChatMessageData } from './types';
import { BASE64_OMIT_PLACEHOLDER } from '../../lib/utils';
import { CopyButton } from './MessageActions';

export default function ErrorMessage({ message }: { message: ChatMessageData }) {
  const parts = useMemo(() => {
    if (!message.content.includes(BASE64_OMIT_PLACEHOLDER)) return null;
    return message.content.split(BASE64_OMIT_PLACEHOLDER);
  }, [message.content]);

  return (
    <div className="group/error relative rounded-lg border border-(--color-destructive)/30 bg-(--color-destructive)/5 px-4 py-3 max-h-[600px] overflow-y-auto **:select-text">
      <div className="absolute top-2 right-2 opacity-0 group-hover/error:opacity-100 transition-opacity">
        <CopyButton text={message.content} />
      </div>
      <pre className="text-xs text-(--color-destructive) whitespace-pre-wrap break-all font-mono select-text">
        {parts ? parts.map((segment, i) => (
          <span key={i}>
            {segment}
            {i < parts.length - 1 && (
              <span className="text-amber-500 opacity-80">{BASE64_OMIT_PLACEHOLDER}</span>
            )}
          </span>
        )) : message.content}
      </pre>
    </div>
  );
}
