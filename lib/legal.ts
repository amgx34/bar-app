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
export const TERMS_VERSION = '2026-08-19';

/** Shown on the page. Kept beside the version so the two cannot drift. */
export const TERMS_UPDATED = '2026-08-19';

export const PRIVACY_UPDATED = '2026-08-17';

/**
 * The agent EULA is versioned separately from the Terms.
 *
 * They cover different things and change on different schedules: the Terms
 * govern the hosted service, this governs a binary installed on someone else's
 * Windows machine. Tying them together would force a re-acceptance of the
 * service terms every time the agent shipped a licence clarification.
 */
export const EULA_VERSION = '2026-08-19';
export const EULA_UPDATED = '2026-08-19';

/** Where policy questions go. */
export const LEGAL_CONTACT_EMAIL = 'railsystemspos@gmail.com';

/**
 * Governing law for the Terms and the agent EULA.
 *
 * Both pages render the governing-law section only when this is non-null. It
 * stayed null until there was a real answer, because it is the one clause a
 * court reads first: naming a state the business is not organised in is both
 * unenforceable and evidence of carelessness about the rest of the document.
 *
 * `venue` is the county whose courts hear a dispute, and it must be a county
 * that exists within `state` — the two are rendered in the same sentence.
 */
export const GOVERNING_LAW: { state: string; venue: string } | null = {
  state: 'Ohio',
  venue: 'Hamilton County, Ohio',
};

/**
 * Legal entity name — who the contract is actually with.
 *
 * Both policy pages fall back to the product name when this is null, which is
 * honest for a sole operator and wrong once there is an entity. Written exactly
 * as it is registered, because this is the name a user is agreeing with.
 */
export const LEGAL_ENTITY_NAME: string | null = 'Rail Pos Systems';
