import { forwardRef } from 'react';

interface NativeCheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const NativeCheckbox = forwardRef<HTMLInputElement, NativeCheckboxProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <label className="inline-flex items-center gap-1.5 cursor-pointer">
        <input
          ref={ref}
          type="checkbox"
          className={`cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          {...props}
        />
        {label && <span className="text-[13px] text-[var(--color-label)]">{label}</span>}
      </label>
    );
  }
);

NativeCheckbox.displayName = 'NativeCheckbox';
