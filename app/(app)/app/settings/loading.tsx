import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="p-6 space-y-8 max-w-3xl mx-auto">
      {/* Title */}
      <div className="space-y-1.5">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Bar settings card */}
      <div className="rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b space-y-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3.5 w-48" />
        </div>
        <div className="px-6 py-5 grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </div>

      {/* POS card */}
      <div className="rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b space-y-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <div className="px-6 py-5 space-y-4">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
