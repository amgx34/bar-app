// Vercel Cron endpoint — runs every 15 minutes to check Gmail for new
// 2TouchPOS report emails and auto-ingest them into z_report_days.
//
// Vercel passes the CRON_SECRET via Authorization header.
// vercel.json schedule: "*/15 * * * *"  (Pro plan)
//                    or "0 * * * *"     (free plan — hourly)

import { NextResponse, type NextRequest } from 'next/server';
import { poll2TouchEmails } from '@/lib/2touch/poll-emails';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify the request comes from Vercel Cron
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await poll2TouchEmails();
  console.log('[cron/2touch]', result);
  return NextResponse.json(result);
}
