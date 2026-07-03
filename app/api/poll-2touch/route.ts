/**
 * POST /api/poll-2touch — manually trigger a 2Touch email poll.
 * Requires an authenticated session (org member).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { poll2TouchEmails } from '@/lib/2touch/poll-emails';

export const runtime    = 'nodejs';
export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await poll2TouchEmails();
  return NextResponse.json(result);
}
