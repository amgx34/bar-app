import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh grid place-items-center p-6 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=1920&q=80')",
        }}
      />
      <div className="absolute inset-0 bg-gray-900/65" />
      <div className="relative z-10 w-full flex flex-col items-center gap-6">
        <p className="text-white/40 text-xs font-medium tracking-widest uppercase select-none">
          Bar Management
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="text-white/25 text-[11px]">
          &copy; {new Date().getFullYear()} All rights reserved
        </p>
      </div>
    </main>
  );
}
