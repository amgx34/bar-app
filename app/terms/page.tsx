import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/app/_components/legal-page';
import { SITE_NAME } from '@/lib/site';
import {
  TERMS_UPDATED,
  TERMS_VERSION,
  LEGAL_CONTACT_EMAIL,
  GOVERNING_LAW,
  LEGAL_ENTITY_NAME,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `The agreement between ${SITE_NAME} and the bars that use it — what the software does, what it deliberately does not do, and who is responsible for payroll and employee data.`,
  alternates: { canonical: '/terms' },
  openGraph: { url: '/terms' },
};

const US = LEGAL_ENTITY_NAME ?? SITE_NAME;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={TERMS_UPDATED}
      intro={
        <>
          These terms govern your use of {SITE_NAME}. They matter more than most
          software terms do, because {SITE_NAME} touches <strong>payroll, tip
          allocation and bank details</strong> — and because the people whose data
          you put into it are mostly your employees, not our users. Please read the
          payroll and data sections in particular.
        </>
      }
    >
      <section>
        <h2>1. Who this agreement is between</h2>
        <p>
          This is an agreement between {US} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) and the
          business that opens an account — the bar, restaurant or venue
          (&ldquo;you&rdquo;). If you are accepting these terms, you confirm you are
          authorised to bind that business.
        </p>
        <p>
          People you invite into your account — managers, accountants — use{' '}
          {SITE_NAME} under your account and your instruction. You are responsible
          for what they do in it.
        </p>
      </section>

      <section>
        <h2>2. What {SITE_NAME} is</h2>
        <p>
          {SITE_NAME} is bar management software. It tracks inventory, calculates
          tip splits and pay, reads nightly POS reports, and produces files and
          reports you can act on.
        </p>
        <p>
          It is a <strong>calculation and record-keeping tool</strong>. Being
          direct about the boundary, because it is where the real risk sits —{' '}
          {SITE_NAME} is <strong>not</strong>:
        </p>
        <ul>
          <li>
            a payroll provider, employer of record, or payroll tax filer. We do not
            file, withhold or remit any tax on your behalf.
          </li>
          <li>
            a bank, money transmitter or payment processor. We do not hold, move or
            touch your money. Where {SITE_NAME} produces an ACH/NACHA file, it is a
            file — you submit it to your own bank, and your bank moves the money.
          </li>
          <li>
            a source of legal, tax, accounting or employment advice. Tip pooling and
            tip credit rules in particular vary by state and change; what{' '}
            {SITE_NAME} calculates reflects the settings you enter, not a judgement
            that those settings are lawful where you operate.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Payroll, tips and direct deposit</h2>
        <p>
          You are responsible for checking the numbers before you pay anyone.{' '}
          {SITE_NAME} calculates from the data it receives — hours from your POS or
          your uploads, rates and split percentages you configure. If any of that is
          wrong, the output is wrong, and it will look entirely plausible.
        </p>
        <p>
          Specifically, you remain responsible for: minimum wage and overtime
          compliance; the legality of your tip pool and who is in it; tax
          withholding and filing; and the accuracy of every bank account detail
          before an ACH file leaves your hands. Review each pay run.
        </p>
        <p>
          Bank account numbers you store in {SITE_NAME} are encrypted at rest. That
          protects them in storage; it does not make us responsible for a payment
          sent to an account someone typed in incorrectly.
        </p>
      </section>

      <section>
        <h2>4. Your data and your employees</h2>
        <p>
          Your data stays yours. We store and process it to run the service for you,
          and for nothing else — we do not sell it, and we do not use your bar&rsquo;s
          operating data to build products for anyone else.
        </p>
        <p>
          Most of the personal data in {SITE_NAME} is about your employees, who never
          agreed to anything with us. You are the controller of that data and we are
          your processor. You are responsible for having a lawful basis to put it in,
          for telling your staff you have, and for handling their requests to see or
          delete it. We will help you action those requests.
        </p>
        <p>
          Uploaded POS exports may be sent to a third-party AI service to be read.
          The <Link href="/privacy">Privacy Policy</Link> names that service and
          explains what is sent. Do not upload documents containing data you are not
          permitted to share with a processor.
        </p>
      </section>

      <section>
        <h2>5. The POS agent</h2>
        <p>
          If you install the {SITE_NAME} agent on your POS machine, it reads the
          2TouchPOS database and sends sales, hours and tip figures to your account.
          It connects with a read-only database login and does not write to your POS.
        </p>
        <p>
          You are responsible for having the right to install software on that
          machine and to extract that data from it. Each installation is paired to
          your account with its own secret; keep it confidential, and run the
          uninstaller if you decommission or sell the machine, which removes both the
          stored credentials and the database login.
        </p>
      </section>

      <section>
        <h2>6. Acceptable use</h2>
        <p>Do not:</p>
        <ul>
          <li>use {SITE_NAME} to break the law, including wage and hour law;</li>
          <li>
            attempt to reach another bar&rsquo;s data, probe the service for
            vulnerabilities without our written permission, or interfere with its
            operation;
          </li>
          <li>share login credentials, or leave access with people who have left;</li>
          <li>resell or white-label the service without our agreement.</li>
        </ul>
        <p>
          If you find a security problem, tell us at{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. We will
          not pursue you for a good-faith report.
        </p>
      </section>

      <section>
        <h2>7. Availability</h2>
        <p>
          We work to keep {SITE_NAME} available and correct, but we do not promise
          uninterrupted service. There is no uptime guarantee in this agreement.
          Maintenance, provider outages and faults will happen; a bar&rsquo;s
          operations should not depend on {SITE_NAME} being reachable at a specific
          moment.
        </p>
        <p>
          Keep your own copies of anything you need for compliance. Export your data
          before you close your account.
        </p>
      </section>

      <section>
        <h2>8. Warranties and liability</h2>
        <p>
          The service is provided &ldquo;as is&rdquo;. To the fullest extent the law
          allows, we disclaim implied warranties of merchantability, fitness for a
          particular purpose and non-infringement.
        </p>
        <p>
          To the fullest extent the law allows, we are not liable for lost profits,
          lost data, or indirect or consequential loss; and our total liability for
          any claim is limited to the amount you paid us in the twelve months before
          the claim arose.
        </p>
        <p>
          Nothing here limits liability that cannot lawfully be limited — including
          for fraud, or for death or personal injury caused by negligence.
        </p>
      </section>

      <section>
        <h2>9. Ending the agreement</h2>
        <p>
          You may stop using {SITE_NAME} and close your account at any time. Ask us
          and we will delete your data; some records are retained where the law
          requires it, as set out in the{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          We may suspend an account that is being used to break the law or to attack
          the service. Except where the risk is immediate, we will tell you first and
          give you a chance to put it right.
        </p>
      </section>

      <section>
        <h2>10. Changes to these terms</h2>
        <p>
          We may update these terms. If a change materially affects your rights or
          obligations, we will publish the new version and ask you to accept it the
          next time you sign in — you will not be bound by a substantive change you
          were never shown. Minor corrections that do not change the substance are
          made without a new acceptance.
        </p>
        <p>
          This is version <strong>{TERMS_VERSION}</strong>. We keep a record of which
          version each account accepted, and when.
        </p>
      </section>

      {/* Rendered only once GOVERNING_LAW is set. Naming a jurisdiction we are
          not organised in would be worse than omitting the clause — see the note
          in lib/legal.ts. */}
      {GOVERNING_LAW && (
        <section>
          <h2>11. Governing law</h2>
          <p>
            These terms are governed by the laws of the State of{' '}
            {GOVERNING_LAW.state}, without regard to its conflict of laws rules. The
            courts of {GOVERNING_LAW.venue} have exclusive jurisdiction over any
            dispute arising from them.
          </p>
        </section>
      )}

      <section>
        <h2>{GOVERNING_LAW ? '12' : '11'}. Contact</h2>
        <p>
          Questions about these terms:{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
