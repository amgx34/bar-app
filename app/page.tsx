import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-semibold">Bar Inventory</h1>
        <div className="flex gap-2 justify-center">
          <Link href="/login" className={buttonVariants()}>Log in</Link>
        </div>
      </div>
    </main>
  );
}
