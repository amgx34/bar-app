import { SectionTabs } from '../_components/section-tabs';

/**
 * Rendered from the layout, not the pages, so the strip does not re-mount on
 * navigation and cannot be double-rendered by a page that also includes it.
 */
export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs />
      {children}
    </>
  );
}
