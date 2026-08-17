/**
 * GET /api/agent/manifest
 *
 * What the newest 2Touch agent build is, and where to get it. rail-update.exe
 * on each POS box polls this, compares it against the version of the executable
 * it finds on disk, and swaps the binary if this one is newer.
 *
 * Driven entirely by environment variables so that publishing a release is a
 * Vercel env change, not a code deploy. The binary itself is NOT served from
 * here — a self-contained .NET build is ~70MB, which is the wrong shape for a
 * serverless function. `AGENT_DOWNLOAD_URL` points at wherever it is hosted
 * (GitHub Releases, blob storage); this route only publishes the pointer.
 *
 * Deliberately unauthenticated. It discloses one version number and one URL for
 * a binary that has to be publicly downloadable anyway, and requiring the org
 * token here would mean an agent with a stale or revoked token could never
 * update itself to the build that fixes it.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Rejects anything that is not plain Major.Minor.Patch. */
const SEMVER = /^\d+\.\d+\.\d+$/;
/** A SHA-256 digest, lowercase hex. */
const SHA256 = /^[a-f0-9]{64}$/;

export async function GET() {
  const version = process.env.AGENT_LATEST_VERSION?.trim();
  const url = process.env.AGENT_DOWNLOAD_URL?.trim();
  const sha256 = process.env.AGENT_SHA256?.trim().toLowerCase();

  // No release configured yet. 204 rather than an error: the updater treats
  // "nothing published" as "you are current", which is the correct behaviour on
  // a fresh deployment and keeps a missing env var from spamming every POS box
  // in the estate with a failure it cannot act on.
  if (!version || !url || !sha256) {
    return new NextResponse(null, { status: 204 });
  }

  // A malformed manifest is worse than no manifest: it would send every agent
  // chasing a download that cannot verify. Fail closed and loudly in the logs.
  const problems: string[] = [];
  if (!SEMVER.test(version)) problems.push(`AGENT_LATEST_VERSION "${version}" is not Major.Minor.Patch`);
  if (!SHA256.test(sha256)) problems.push('AGENT_SHA256 is not a 64-character hex digest');
  if (!url.startsWith('https://')) problems.push('AGENT_DOWNLOAD_URL must be https');

  if (problems.length) {
    console.error('[agent/manifest] refusing to publish a malformed manifest:', problems);
    return NextResponse.json(
      { error: 'Agent manifest is misconfigured' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    version,
    // The updater refuses to run an update where the digest does not match, so
    // this is the integrity control for the whole mechanism. HTTPS protects it
    // in transit; this protects against a wrong or truncated file at the host.
    sha256,
    url,
    // Optional floor. An agent older than this is told the update is required
    // rather than available — for a release that fixes data corruption or a
    // credential problem, where "remind me later" is the wrong answer.
    minimumVersion: process.env.AGENT_MINIMUM_VERSION?.trim() || null,
    releaseNotes: process.env.AGENT_RELEASE_NOTES?.trim() || null,
    // Name the file must be saved as. Pinned here rather than taken from the
    // URL so a release hosted under a hashed filename still lands correctly.
    fileName: 'rail-2touch-agent.exe',
  });
}
