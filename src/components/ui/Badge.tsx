import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'secondary' | 'outline';

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-(--color-accent)/10 text-(--color-accent)',
  secondary: 'bg-(--color-fill-secondary) text-(--color-label-secondary)',
  outline: 'border border-(--color-separator) text-(--color-label-secondary)',
};

export function Badge({ variant = 'secondary', className = '', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none shrink-0 ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
