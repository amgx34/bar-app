'use client';

import { usePathname } from 'next/navigation';
import { breadcrumbsFor } from '../../_components/nav-config';

/** The page's one h1, named for the tab so sub-pages do not all read "Payroll". */
export function PayrollHeading() {
  const tab = breadcrumbsFor(usePathname())[1];
  return (
    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
      {tab ? `Payroll: ${tab.label}` : 'Payroll'}
    </h1>
  );
}
