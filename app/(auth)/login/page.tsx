import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
