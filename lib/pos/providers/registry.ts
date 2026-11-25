import type { PosProvider } from '@/lib/pos/credentials';
import type { PosAdapter } from './types';
import { cloverAdapter } from './clover/adapter';
import { toastAdapter } from './toast/adapter';

const adapters: Partial<Record<PosProvider, PosAdapter>> = {
  clover: cloverAdapter,
  toast: toastAdapter,
};

export function adapterFor(provider: string | null | undefined): PosAdapter | null {
  return (provider && adapters[provider as PosProvider]) || null;
}
