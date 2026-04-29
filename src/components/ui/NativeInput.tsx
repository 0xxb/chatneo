import { forwardRef } from 'react';

interface NativeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const NativeInput = forwardRef<HTMLInputElement, NativeInputProps>(
  ({ label, error, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm text-(--color-label-secondary)">{label}</label>
      )}
      <input
        ref={ref}
        className={`h-7 px-2 rounded text-[13px] bg-(--color-fill-secondary) text-(--color-label) border-0 placeholder:text-(--color-label-tertiary) hover:bg-(--color-fill-secondary) focus:outline-none focus:bg-(--color-fill-secondary) disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-(--color-destructive)">{error}</span>}
    </div>
  )
);

NativeInput.displayName = 'NativeInput';
