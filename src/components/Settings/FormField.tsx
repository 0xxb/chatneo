import type { ReactNode } from 'react';

export function FormField({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[13px] text-(--color-label)">{label}</label>
      {desc && <p className="text-[11px] text-(--color-label-tertiary)">{desc}</p>}
      <div>{children}</div>
    </div>
  );
}
