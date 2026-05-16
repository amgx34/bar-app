import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { pollEmailReplies } from '@/lib/email/poll-replies';

// POST /api/email-replies — trigger an IMAP poll for order reply emails.
// Requires an authenticated session.
export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await pollEmailReplies();
  return NextResponse.json(result);
}
