import { redirect } from 'next/navigation';
import { isIsoDate } from '@/lib/date-range';

export const dynamic = 'force-dynamic';

/**
 * The Day Split's old home.
 *
 * It is the day view of `/app/payroll` now, so this route only forwards. Kept
 * rather than deleted because the path has been in the sidebar, in bookmarks
 * and in links sent to staff — the same reason `LEGACY_TAB_ROUTES` exists.
 */
export default async function DaySplitRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const date = isIsoDate(params.date) ? `&date=${params.date}` : '';
  redirect(`/app/payroll?view=day${date}`);
}
