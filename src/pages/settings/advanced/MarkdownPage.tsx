import { useEffect, useState } from 'react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { cjk } from '@streamdown/cjk';

const plugins = { code, cjk };

export default function MarkdownPage({ src, emptyText }: { src: string; emptyText: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(src, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.text();
      })
      .then(setContent)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [src]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-(--color-label-tertiary)">
        {emptyText}
      </div>
    );
  }

  if (content === null) return null;

  return (
    <div className="max-w-2xl mx-auto p-5 text-[13px] text-(--color-label) leading-relaxed **:select-text">
      <Streamdown plugins={plugins}>{content}</Streamdown>
    </div>
  );
}
