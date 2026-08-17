import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Inline success / error state for a form.
 *
 * Toasts alone are not enough for form outcomes. They disappear on a timer,
 * they appear far from the field that caused them, and on a phone they cover
 * the thing you were about to fix. This stays put, next to the control, until
 * the state actually changes.
 *
 * The live region is what makes it work for a screen reader:
 *   - errors use role="alert" (assertive) — the submit failed and nothing else
 *     the user does matters until they know
 *   - success uses role="status" (polite) — it waits for a pause rather than
 *     cutting across whatever is being read
 *
 * The wrapper is rendered unconditionally by the caller and its CONTENT
 * toggled, because a live region added to the DOM at the same moment as its
 * text is frequently not announced at all.
 */
export function FormStatus({
  status,
  message,
  className,
}: {
  status: 'idle' | 'error' | 'success';
  message?: string | null;
  className?: string;
}) {
  const isError = status === 'error';
  const isSuccess = status === 'success';
  const Icon = isError ? AlertCircle : CheckCircle2;

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={cn(
        // Colour is reinforcement, never the only signal: there is an icon and
        // the text says what happened.
        isError || isSuccess
          ? 'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm'
          : 'sr-only',
        isError && 'border-destructive/40 bg-destructive/10 text-destructive',
        isSuccess && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        className,
      )}
    >
      {(isError || isSuccess) && message && (
        <>
          <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{message}</span>
        </>
      )}
    </div>
  );
}
