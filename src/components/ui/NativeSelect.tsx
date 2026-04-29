import { forwardRef } from 'react';

interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ label, error, className = '', children, ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm text-(--color-label-secondary)">{label}</label>
      )}
      <select
        ref={ref}
        className={`h-7 px-2 rounded text-[13px] bg-(--color-fill-secondary) text-(--color-label) border-0 hover:bg-(--color-fill-secondary) focus:outline-none focus:bg-(--color-fill-secondary) disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-default ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-xs text-(--color-destructive)">{error}</span>}
    </div>
  )
);

NativeSelect.displayName = 'NativeSelect';
