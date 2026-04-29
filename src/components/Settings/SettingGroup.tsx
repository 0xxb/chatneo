import { Children, type ReactNode } from 'react';

export function SettingGroup({ title, children }: { title: string; children: ReactNode }) {
  const items = Children.toArray(children);

  return (
    <section>
      <h3 className="text-[11px] font-medium text-(--color-label-secondary) uppercase tracking-wide mb-1.5 px-1">
        {title}
      </h3>
      <div className="bg-settings-group rounded-lg">
        {items.map((child, index) => (
          <div key={index}>
            {index > 0 && <div className="mx-3 border-t border-(--color-separator)" />}
            {child}
          </div>
        ))}
      </div>
    </section>
  );
}

export function SettingRow({ label, desc, icon, children }: { label: string; desc?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <div className="flex items-center gap-2">
        {icon && <span className="text-(--color-label-secondary)">{icon}</span>}
        <div>
          <span className="text-[13px] text-(--color-label) block">{label}</span>
          {desc && <span className="text-[11px] text-(--color-label-secondary) block">{desc}</span>}
        </div>
      </div>
      <div className="text-[13px] text-(--color-label-secondary) shrink-0 ml-4">{children}</div>
    </div>
  );
}
