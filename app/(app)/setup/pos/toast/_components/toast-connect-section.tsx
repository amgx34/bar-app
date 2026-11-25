'use client';

import { useRouter } from 'next/navigation';
import { ToastConnectForm } from './toast-connect-form';

export function ToastConnectSection() {
  const router = useRouter();
  return <ToastConnectForm onConnected={() => router.push('/app/dashboard')} />;
}
