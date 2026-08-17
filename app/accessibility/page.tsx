import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/app/_components/legal-page';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Accessibility Statement',
  description: `${SITE_NAME}'s accessibility conformance target, what has been fixed, what is still outstanding, and how to report a barrier.`,
  alternates: { canonical: '/accessibility' },
  openGraph: { url: '/accessibility' },
};

const UPDATED = '2026-08-17';
const CONTACT_EMAIL = 'railsystemspos@gmail.com';

export default function AccessibilityPage() {
  return (
    <LegalPage
      title="Accessibility Statement"
      updated={UPDATED}
      intro={
        <>
          Bar staff use {SITE_NAME} on a phone behind a bar, at speed, often
          one-handed. Accessible design is the same work as making it usable in
          that setting, so we treat it as part of the product rather than a
          compliance exercise.
        </>
      }
    >
      <section>
        <h2>Our target</h2>
        <p>
          We aim to conform to{' '}
          <a
            href="https://www.w3.org/TR/WCAG21/"
            rel="noopener noreferrer"
            target="_blank"
          >
            WCAG 2.1 Level AA
          </a>
          . We are <strong>partially conformant</strong>: most of the standard is
          met, and the known gaps are listed below rather than left unsaid.
        </p>
      </section>

      <section>
        <h2>What we have addressed</h2>
        <ul>
          <li><strong>Contrast.</strong> Every colour pair in the interface is checked against a 4.5:1 minimum for text and 3:1 for controls and chart marks. Both light and dark themes were verified independently.</li>
          <li><strong>Headings.</strong> Section titles are real headings, so screen reader users can navigate a dense dashboard by structure rather than reading it end to end.</li>
          <li><strong>Keyboard.</strong> A skip link goes straight to the main content, focus is visible throughout, and focus moves to the new page on navigation.</li>
          <li><strong>Controls.</strong> Navigation items are single, correctly-labelled controls; icon-only buttons carry accessible names.</li>
          <li><strong>Touch.</strong> Targets meet the 44&times;44px minimum on mobile, and fixed bars reserve space so they never cover content, including on devices with a home indicator.</li>
          <li><strong>Motion.</strong> Animation is minimal and respects <code>prefers-reduced-motion</code>.</li>
          <li><strong>Status.</strong> Information is never conveyed by colour alone — status carries a label or an icon as well.</li>
        </ul>
      </section>

      <section>
        <h2>Known gaps</h2>
        <p>These are real and we are working on them:</p>
        <ul>
          <li><strong>Charts.</strong> Analytics charts are readable visually but do not yet expose their values to screen readers, and series are distinguished largely by colour. A data-table alternative is planned for every chart.</li>
          <li><strong>Data tables.</strong> Sortable columns do not yet announce their sort state.</li>
          <li><strong>Deep pages.</strong> Some three-level routes lack breadcrumbs, which makes orientation harder.</li>
          <li><strong>Testing.</strong> Our review to date has been manual and automated rather than tested with assistive technology users. We have not commissioned an independent audit.</li>
        </ul>
      </section>

      <section>
        <h2>Compatibility</h2>
        <p>
          {SITE_NAME} is built to work with recent versions of Chrome, Edge, Firefox
          and Safari, on desktop and mobile, together with the screen readers those
          platforms ship. It requires JavaScript. We do not support Internet
          Explorer.
        </p>
      </section>

      <section>
        <h2>Tell us about a barrier</h2>
        <p>
          If any part of {SITE_NAME} stops you doing something, we want to hear
          about it — that is the fastest way for us to find what our own testing
          missed. Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the page and
          what happened.
        </p>
        <p>
          We aim to reply within five business days. If something blocks you from
          doing your job, say so and we will prioritise it and give you a way to
          work around it in the meantime.
        </p>
        <p>
          See also our <Link href="/privacy">privacy policy</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
