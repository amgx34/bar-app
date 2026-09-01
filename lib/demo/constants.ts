/**
 * The two strings that identify a demo account.
 *
 * They live here because three places must agree on them and previously did not
 * share a definition: /api/demo mints the slug and counts it against the live
 * cap, seedDemoOrg() writes it, and the purge sweeps by it. The slug prefix in
 * particular is load-bearing — it is the only durable handle the purge has on a
 * demo org, since deleting the demo user cascades its membership away. A drift
 * between any two of these copies silently stops the sweep finding anything.
 */

/** Demo auth users. Their TTL is enforced against auth.users.created_at. */
export const DEMO_EMAIL_SUFFIX = '@rail.demo';

/** Demo organizations. seedDemoOrg() appends a base-36 timestamp. */
export const DEMO_SLUG_PREFIX = 'demo-tipsy-tavern-';
