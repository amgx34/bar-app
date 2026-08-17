import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/app/_components/legal-page';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${SITE_NAME} collects, uses, shares and retains data — including the third-party AI service used to read uploaded POS exports.`,
  alternates: { canonical: '/privacy' },
  openGraph: { url: '/privacy' },
};

const UPDATED = '2026-08-17';
const CONTACT_EMAIL = 'railsystemspos@gmail.com';

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      intro={
        <>
          {SITE_NAME} is bar management software. Bars use it to track inventory,
          run payroll and tip splits, and read nightly POS reports. That means we
          handle data about a bar&rsquo;s <strong>employees</strong> — people who
          are not themselves our users. This policy sets out what we hold, who we
          send it to, and how long we keep it.
        </>
      }
    >
      <section>
        <h2>Who controls the data</h2>
        <p>
          Each bar is the controller of its own data. {SITE_NAME} is the processor:
          we store and process it on that bar&rsquo;s instruction. If you are an
          employee of a bar that uses {SITE_NAME} and you want to see or delete
          what is held about you, contact your employer first — they decide what
          goes in. We will help them action it.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>

        <h3>Account and business information</h3>
        <ul>
          <li>Your email address, used to sign in. Passwords are handled by our authentication provider and never stored by us in readable form.</li>
          <li>Bar name, address and operating settings such as tip-split percentages and default hourly rates.</li>
          <li>Your employer identification number (EIN), only if you set up direct deposit — it is required in the bank file format.</li>
        </ul>

        <h3>Employee information, entered by the bar</h3>
        <ul>
          <li>Name, role, hourly rate and tip mode.</li>
          <li>Hours worked, sales attributed to them, and tips paid out.</li>
        </ul>
        <p>
          We do <strong>not</strong> collect employee Social Security numbers or
          dates of birth. The W-2 and 1099 features produce drafts containing
          names and wage totals only; you complete the identifying fields yourself
          outside {SITE_NAME}.
        </p>

        <h3>Bank details, if you use direct deposit</h3>
        <p>
          Routing and account numbers are encrypted with AES-256-GCM before they
          are written to the database and are never stored in plain text. Only the
          last four digits are shown back in the interface. Changes are recorded in
          an audit log that includes the IP address the change came from.
        </p>

        <h3>Sales data from your POS</h3>
        <p>
          Daily totals, tips, per-server sales and item-level sales, either pushed
          by the on-premises agent, imported from a file you upload, or read from a
          connected POS account.
        </p>

        <h3>Technical data</h3>
        <ul>
          <li>IP addresses, used to rate-limit sign-in attempts, demo creation and the contact form. These counters are deleted within 24 hours.</li>
          <li>Server logs of errors and requests, kept by our hosting provider.</li>
          <li>
            Aggregate page-view counts, collected by Vercel Web Analytics. It is
            cookieless: no identifier is stored on your device, IP addresses are
            not retained, and visitors are not tracked between sites or across
            sessions. We use it to see which pages are used, nothing more.
          </li>
        </ul>
        <p>
          We use no advertising cookies and no cross-site tracking. The only
          cookies set are the ones required to keep you signed in.
        </p>
      </section>

      <section>
        <h2>Artificial intelligence — please read this part</h2>
        <p>
          When a POS export is not in a format {SITE_NAME} recognises, the file
          contents are sent to <strong>Groq</strong>, a third-party AI provider,
          which extracts the figures using a large language model. This happens on
          three screens: Z-report import, employee-shift import, and inventory
          import.
        </p>
        <p>
          The text sent can include <strong>employee names, hours worked, sales
          and tip amounts</strong>, because that is what the report contains. It
          can also include supplier and pricing information from invoices. We send
          only the file&rsquo;s text, truncated to what is needed to read it — never
          your bank details, and never your login credentials.
        </p>
        <p>
          We do not use your data to train any model, and we do not permit our
          providers to. If you would rather no employee data reached an AI service
          at all, use a supported export format or enter the figures manually; the
          AI path is only a fallback for unrecognised files.
        </p>
      </section>

      <section>
        <h2>Who else receives data</h2>
        <p>
          We share data only with the providers needed to run the service. We do
          not sell it, and we do not share it for advertising.
        </p>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Purpose</th>
              <th>What it receives</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>Database and authentication</td>
              <td>All stored data, including encrypted bank details</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>Application hosting and cookieless page-view analytics</td>
              <td>Requests, IP addresses, server logs, aggregate page views</td>
            </tr>
            <tr>
              <td>Groq</td>
              <td>Reading unrecognised POS and invoice files</td>
              <td>The text of files you upload for import</td>
            </tr>
            <tr>
              <td>Twilio</td>
              <td>SMS — direct-deposit verification codes, supplier orders</td>
              <td>Recipient phone number and message text</td>
            </tr>
            <tr>
              <td>Google (Gmail)</td>
              <td>Sending supplier orders and reading replies</td>
              <td>Recipient address, subject and body</td>
            </tr>
            <tr>
              <td>Clover</td>
              <td>POS integration, only if you connect it</td>
              <td>Authorisation to read your sales and item data</td>
            </tr>
          </tbody>
        </table>
        <p>
          We may also disclose data where the law requires it, or to protect the
          rights and safety of our users.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li><strong>Your bar&rsquo;s operating data</strong> — for as long as the account is open. Payroll and sales history is retained because tax rules generally require it.</li>
          <li><strong>Demo accounts</strong> — deleted automatically 24 hours after creation, along with all their data.</li>
          <li><strong>Rate-limit records</strong> — deleted within 24 hours.</li>
          <li><strong>Uploaded files</strong> — never stored. Files are read in your browser, parsed, and discarded; only the extracted figures are saved.</li>
        </ul>
        <p>
          Close your account and we will delete its data within 30 days, except
          where we are required to keep records for longer.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          Depending on where you live, you may have the right to access, correct,
          export or delete your personal data, to object to processing, and to
          complain to a data protection authority. Email us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will
          respond within 30 days. We will not charge you or degrade your service
          for exercising any of these rights.
        </p>
        <p>
          Employees of a customer bar: your employer controls your record, so
          please ask them first. If they cannot help, contact us and we will.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <ul>
          <li>All traffic is encrypted in transit over HTTPS.</li>
          <li>Bank routing and account numbers are encrypted at rest with AES-256-GCM.</li>
          <li>Each bar&rsquo;s data is isolated, and access is restricted to members of that bar.</li>
          <li>Direct-deposit changes require a one-time code and are recorded in an audit log.</li>
        </ul>
        <p>
          No system is perfectly secure. If you believe you have found a
          vulnerability, please email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> rather than
          disclosing it publicly, and we will work with you on it.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          {SITE_NAME} is a tool for businesses and is not directed at children. We
          do not knowingly collect data from anyone under 16.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          If we change this policy materially we will update the date at the top
          and notify account holders by email before the change takes effect.
        </p>
        <p>
          Questions, requests or complaints:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also our{' '}
          <Link href="/accessibility">accessibility statement</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
