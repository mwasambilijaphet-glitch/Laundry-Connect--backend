'use client';
import { ReactNode, ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'gold' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

const variants = {
  gold:    'btn-gold',
  outline: 'btn-outline',
  ghost:   'btn-ghost',
  danger:  'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-red-600 text-white hover:bg-red-700 transition-all duration-200 disabled:opacity-50',
};
const sizes = { sm: 'text-xs px-4 py-2', md: '', lg: 'text-base px-8 py-4' };

export default function Button({ variant = 'gold', size = 'md', loading, children, disabled, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
