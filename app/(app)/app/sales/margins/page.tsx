import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Margins folded into the week and month views of /app/sales, including the
 * per-item table with its sgl/dbl/rsgl/rdb size split (SizeSplit in
 * ../_components/sales-bits.tsx) — see the "Every item" card in
 * ../page.tsx's week/month branch.
 */
export default function MarginsRedirect() {
  redirect('/app/sales?view=month');
}
