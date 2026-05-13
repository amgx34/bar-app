'use client';

import { useState } from 'react';
import { Loader2, PlayCircle } from 'lucide-react';

interface Props {
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

export function DemoButton({ size = 'default', className = '' }: Props) {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    setLoading(true);
    // Navigate to the demo route — it handles user creation, seeding, and sign-in
    window.location.href = '/api/demo';
  }

  const sizeClasses = {
    sm:      'h-9 px-4 text-sm',
    default: 'h-10 px-6 text-sm',
    lg:      'h-12 px-8 text-base',
  }[size];

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 font-semibold rounded-xl border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${sizeClasses} ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Setting up demo…
        </>
      ) : (
        <>
          <PlayCircle className="h-4 w-4" />
          Try Demo Account
        </>
      )}
    </button>
  );
}
