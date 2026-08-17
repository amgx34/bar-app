import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Fixed-window rate limiting backed by Postgres.
 *
 * Every counter lives in the database rather than in memory, because each
 * serverless instance has its own memory — an in-process counter is bypassed by
 * spreading requests across cold starts.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitRule = {
  /** Namespace, so two surfaces never share a counter. */
  name: string;
  limit: number;
  windowSeconds: number;
};

/** Tuned per surface: cost of the operation vs. what a real person does. */
export const RATE_LIMITS = {
  /** Each hit provisions an auth user, an org, and a seeded dataset. */
  demoCreate:   { name: 'demo',          limit: 3,  windowSeconds: 60 * 60 },
  /** Writes a row and sends mail to a human inbox. */
  contactForm:  { name: 'contact',       limit: 5,  windowSeconds: 60 * 60 },
  /** Generous enough for typos, tight enough to make guessing useless. */
  login:        { name: 'login',         limit: 10, windowSeconds: 15 * 60 },
  /** Each call bills a third-party model against uncapped input. */
  aiParse:      { name: 'ai-parse',      limit: 30, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Best-effort client address.
 *
 * Vercel overwrites `x-forwarded-for` at the edge, so the first entry is the
 * real peer. Do not trust this where the app can be reached without the proxy
 * in front of it — a client can set the header itself.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Records a hit and reports whether it is allowed.
 *
 * **Fails open.** If the database is unreachable the request proceeds: a broken
 * limiter must not take down login and the contact form. That is the right
 * trade here because nothing behind these limits is destructive — the worst
 * case is the abuse this bounds, which is where we already were. Anything
 * irreversible should fail closed instead.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const bucket = `${rule.name}:${identifier}`;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_bucket: bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });

    if (error) {
      console.warn('[rate-limit] check failed, allowing request:', error.message);
      return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
    }

    // The function returns a single row.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
    }

    return {
      allowed: Boolean(row.allowed),
      remaining: Number(row.remaining ?? 0),
      retryAfterSeconds: Number(row.retry_after_seconds ?? rule.windowSeconds),
    };
  } catch (err) {
    console.warn('[rate-limit] check threw, allowing request:', err);
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }
}

/** Convenience for route handlers: the standard 429 with a Retry-After header. */
export function tooManyRequests(result: RateLimitResult, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(Math.max(result.retryAfterSeconds, 1)),
    },
  });
}
