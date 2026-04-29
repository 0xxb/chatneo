import { forwardRef } from 'react';

interface NativeSwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const NativeSwitch = forwardRef<HTMLInputElement, NativeSwitchProps>(
  ({ label, className = '', ...props }, ref) => (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input
        ref={ref}
        type="checkbox"
        className={`w-9 h-5 appearance-none rounded-full cursor-pointer bg-(--color-fill-secondary) checked:bg-(--color-accent) transition-colors relative before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform before:shadow-sm checked:before:translate-x-4 focus:outline-none focus:ring-2 focus:ring-(--color-focus-ring) disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        {...props}
      />
      {label && <span className="text-sm text-(--color-label)">{label}</span>}
    </label>
  )
);

NativeSwitch.displayName = 'NativeSwitch';
