/**
 * The two strings that identify a demo account.
 *
 * The old per-visitor ones are no longer created; the purge and the retire script
 * still find the leftovers by these. They live here so both agree. The slug prefix in
 * particular is load-bearing — it is the only durable handle the purge has on a
 * demo org, since deleting the demo user cascades its membership away. A drift
 * between any two of these copies silently stops the sweep finding anything.
 */

/** The permanent shared sample bars (rail-demo-tavern and so on). Never swept. */
export const UNIVERSAL_SLUG_PREFIX = 'rail-demo-';

/** Demo auth users. Their TTL is enforced against auth.users.created_at. */
export const DEMO_EMAIL_SUFFIX = '@rail.demo';

/** Old per-visitor demo organizations. */
export const DEMO_SLUG_PREFIX = 'demo-tipsy-tavern-';
