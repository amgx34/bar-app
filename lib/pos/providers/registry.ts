import type { PosProvider } from '@/lib/pos/credentials';
import type { PosAdapter } from './types';
import { cloverAdapter } from './clover/adapter';

/** Toast registers here when its adapter lands. */
const adapters: Partial<Record<PosProvider, PosAdapter>> = {
  clover: cloverAdapter,
};

export function adapterFor(provider: string | null | undefined): PosAdapter | null {
  return (provider && adapters[provider as PosProvider]) || null;
}
