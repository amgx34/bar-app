import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CAPABILITY_HELP, type SalesCapabilities } from '@/lib/pos/sales-capabilities';

/**
 * What stands in for a panel this bar's data cannot support.
 *
 * One sentence naming what is missing and how to get it — never an empty
 * chart, never a zero. A zero on a financial screen is a claim, and the claim
 * "your 2am took nothing" is false when the truth is that nobody recorded it.
 */
export function MissingPanel({
  title,
  capability,
}: {
  title: string;
  capability: keyof SalesCapabilities;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-6">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{CAPABILITY_HELP[capability]}</p>
        </div>
      </CardContent>
    </Card>
  );
}
