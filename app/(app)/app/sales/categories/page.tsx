import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Categories folded into the week and month views of /app/sales.
 *
 * Kept as a redirect rather than deleted: the path has been in the sidebar and
 * in links sent to staff, the same reason LEGACY_TAB_ROUTES exists in Payroll.
 */
export default function CategoriesRedirect() {
  redirect('/app/sales?view=week');
}
