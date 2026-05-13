import { Skeleton } from '@/components/ui/skeleton';

export default function EmployeesLoading() {
  return (
    <main className="p-6 space-y-6">
      <div className="flex items-end justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="rounded-xl border overflow-hidden">
        <div className="border-b px-5 py-3 flex gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="border-b last:border-b-0 px-5 py-4 flex gap-4 items-center">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-4 flex-[2]" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </main>
  );
}
