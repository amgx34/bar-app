/**
 * Versioning for the published policies.
 *
 * TERMS_VERSION is the identity of a specific document, not a display date. It
 * is written verbatim into `terms_acceptances.terms_version`, so:
 *
 *   - Bump it when the substance changes and you need existing users to agree
 *     again. Everyone is re-prompted on their next app load, and their earlier
 *     acceptance stays on record under the old version.
 *   - Do NOT bump it for a typo fix. That would force a re-prompt for every
 *     user and muddy the record with acceptances that mean nothing.
 */
export const TERMS_VERSION = '2026-08-17';

/** Shown on the page. Kept beside the version so the two cannot drift. */
export const TERMS_UPDATED = '2026-08-17';

export const PRIVACY_UPDATED = '2026-08-17';

/**
 * The agent EULA is versioned separately from the Terms.
 *
 * They cover different things and change on different schedules: the Terms
 * govern the hosted service, this governs a binary installed on someone else's
 * Windows machine. Tying them together would force a re-acceptance of the
 * service terms every time the agent shipped a licence clarification.
 */
export const EULA_VERSION = '2026-08-17';
export const EULA_UPDATED = '2026-08-17';

/** Where policy questions go. */
export const LEGAL_CONTACT_EMAIL = 'railsystemspos@gmail.com';

/**
 * Governing law for the Terms.
 *
 * Deliberately null, and the Terms page omits the whole governing-law section
 * while it stays null — the same rule the LocalBusiness address follows in
 * lib/site.ts. Naming a state Rail is not actually organised in would be worse
 * than saying nothing: it is the one clause a court reads first, and an
 * invented one is both unenforceable and evidence of carelessness about the
 * rest of the document.
 *
 * FILL IN before launch, e.g. { state: 'Texas', venue: 'Harris County, Texas' }.
 */
export const GOVERNING_LAW: { state: 'Ohio'; venue: 'Hamilton County, Ohio' } | null = null;

/**
 * Legal entity name. Null until incorporated — the Terms fall back to the
 * product name, which is honest for a sole operator and wrong for a company.
 */
export const LEGAL_ENTITY_NAME: 'Rail Pos Systems' | null = null;
