import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/app/_components/legal-page';
import { SITE_NAME } from '@/lib/site';
import {
  EULA_UPDATED,
  EULA_VERSION,
  LEGAL_CONTACT_EMAIL,
  GOVERNING_LAW,
  LEGAL_ENTITY_NAME,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Agent Software Licence',
  description: `Licence terms for the ${SITE_NAME} 2TouchPOS agent — the Windows service installed on a bar's POS machine.`,
  alternates: { canonical: '/eula' },
  openGraph: { url: '/eula' },
};

const US = LEGAL_ENTITY_NAME ?? SITE_NAME;

/**
 * The EULA covers the AGENT, not the web app.
 *
 * The hosted service is governed by /terms — a service agreement, not a
 * licence, because nobody installs it. This document exists because the 2Touch
 * agent is different in kind: a binary that runs as SYSTEM on a machine we do
 * not own, reads a third party's database, and now updates itself. Those are
 * licence questions, and the Terms are the wrong instrument for them.
 */
export default function EulaPage() {
  return (
    <LegalPage
      title="Agent Software Licence"
      updated={EULA_UPDATED}
      intro={
        <>
          This licence covers the <strong>{SITE_NAME} 2TouchPOS agent</strong> — the
          Windows service you install on a bar&rsquo;s POS machine, along with its
          installer, updater and uninstaller. Your use of the {SITE_NAME} web
          application is governed by the{' '}
          <Link href="/terms">Terms of Service</Link> instead.
        </>
      }
    >
      <section>
        <h2>1. Licence granted</h2>
        <p>
          {US} grants you a non-exclusive, non-transferable, revocable licence to
          install and run the agent on computers you own or control, at premises
          you operate, for as long as you hold an active {SITE_NAME} account.
        </p>
        <p>
          One installation per POS machine. The licence is tied to your account: it
          ends when the account does, and the agent should be uninstalled at that
          point.
        </p>
      </section>

      <section>
        <h2>2. What the agent does on your machine</h2>
        <p>Stated plainly, because it runs unattended and with privilege:</p>
        <ul>
          <li>
            Installs a Windows Service (<code>Rail2TouchSync</code>) that starts
            automatically and runs as <code>LocalSystem</code>.
          </li>
          <li>
            Creates a SQL Server login (<code>BarAppRead</code>) with{' '}
            <strong>read-only</strong> access to the 2Touch database, and reads from
            it every few minutes. It never writes to your POS database.
          </li>
          <li>
            Sends sales totals, employee hours and tip figures to your {SITE_NAME}{' '}
            account over HTTPS, signed with a key unique to your bar.
          </li>
          <li>
            Writes its configuration to the install directory, readable by
            Administrators and SYSTEM only, and writes to the Windows Event Log.
          </li>
          <li>
            Reports its version number to {SITE_NAME} on each sync, so you can see
            which machines are out of date.
          </li>
        </ul>
        <p>
          It does not capture keystrokes, screen contents, card numbers, or any file
          outside its own directory.
        </p>
      </section>

      <section>
        <h2>3. Updates</h2>
        <p>
          The agent does <strong>not</strong> update itself. Updates are applied when
          you run <code>rail-update.exe</code>, or when you schedule it to run. If you
          schedule it, you are choosing to have the binary replaced without a person
          present, and you accept that.
        </p>
        <p>
          Each update is verified against a published SHA-256 checksum before it is
          installed, the previous version is retained, and the update rolls itself
          back if the new build does not start. We will not knowingly ship an update
          that removes functionality your account depends on without telling you
          first.
        </p>
      </section>

      <section>
        <h2>4. What you are responsible for</h2>
        <ul>
          <li>
            Having the right to install software on the machine, and to extract data
            from the POS database on it. If the POS is leased, managed by a vendor, or
            covered by a support contract, check before installing.
          </li>
          <li>
            Keeping the pairing code and the installed configuration confidential.
            Anyone holding them can push data into your {SITE_NAME} account.
          </li>
          <li>
            Running the uninstaller when you decommission, sell or return the machine.
            It removes the service, shreds the stored credentials, and prints the
            script to drop the SQL login — the agent cannot drop its own login,
            because it deliberately never had permission to.
          </li>
          <li>
            Your own backups. The agent reads your POS data; it is not a backup of it.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Restrictions</h2>
        <p>You may not:</p>
        <ul>
          <li>
            reverse engineer, decompile or disassemble the agent, except where that
            right cannot lawfully be excluded;
          </li>
          <li>redistribute, sublicense, rent or sell it;</li>
          <li>
            modify it, or run a modified build against {SITE_NAME}&rsquo;s ingest
            endpoint;
          </li>
          <li>
            use it to read a database you are not authorised to read, or to send one
            bar&rsquo;s data into another bar&rsquo;s account.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Ownership</h2>
        <p>
          The agent is licensed, not sold. {US} retains all rights in it. Your data
          remains yours — this licence covers the software, not the figures it reads.
        </p>
      </section>

      <section>
        <h2>7. Third-party components</h2>
        <p>
          The agent is built on the .NET runtime and other open-source components,
          each under its own licence. Nothing here limits any right you have under
          those licences.
        </p>
      </section>

      <section>
        <h2>8. Warranty and liability</h2>
        <p>
          The agent is provided &ldquo;as is&rdquo;, without warranty of any kind to
          the fullest extent the law allows. It runs on hardware, an operating system
          and a database we do not control.
        </p>
        <p>
          To the fullest extent the law allows, {US} is not liable for lost profits,
          lost or corrupted data, or business interruption arising from the agent; and
          total liability is limited to the amount you paid for {SITE_NAME} in the
          twelve months before the claim. Nothing here limits liability that cannot
          lawfully be limited.
        </p>
      </section>

      <section>
        <h2>9. Termination</h2>
        <p>
          This licence ends if you breach it, or when your {SITE_NAME} account closes.
          On termination, uninstall the agent. Sections 5, 6, 8 and this sentence
          survive.
        </p>
      </section>

      <section>
        <h2>10. Changes</h2>
        <p>
          We may publish a new version of this licence. A new version applies to
          agent builds released after it. This is version{' '}
          <strong>{EULA_VERSION}</strong>.
        </p>
      </section>

      {/* Omitted while GOVERNING_LAW is null — see lib/legal.ts. Naming a
          jurisdiction we are not organised in would be worse than silence. */}
      {GOVERNING_LAW && (
        <section>
          <h2>11. Governing law</h2>
          <p>
            This licence is governed by the laws of the State of {GOVERNING_LAW.state},
            without regard to its conflict of laws rules, and the courts of{' '}
            {GOVERNING_LAW.venue} have exclusive jurisdiction over any dispute
            arising from it.
          </p>
        </section>
      )}

      <section>
        <h2>{GOVERNING_LAW ? '12' : '11'}. Contact</h2>
        <p>
          Questions about this licence:{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
