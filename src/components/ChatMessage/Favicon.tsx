import { useState } from 'react';

export default function Favicon({ domain, size = 16 }: { domain: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!domain || failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded bg-(--color-fill-secondary) font-bold text-(--color-label-tertiary) shrink-0"
        style={{ width: size, height: size, fontSize: Math.max(7, size * 0.5) }}
      >
        {domain?.charAt(0).toUpperCase() ?? '?'}
      </span>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`}
      alt=""
      className="rounded shrink-0"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
