'use client';

import { ErrorPanel } from '@/app/_components/error-panel';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // unstable_retry re-fetches the server render; reset() alone would replay the same failed result.
  return <ErrorPanel error={error} onRetry={() => unstable_retry()} />;
}
