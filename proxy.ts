import { createServerClient } from '@supabase/ssr';
import { DEMO_COOKIE } from '@/lib/demo/constants';
import { isGatedPath } from '@/lib/auth/gated-path';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  // Lets the app layout tell which page a blocked bar is asking for (see lib/billing/paywall.ts).
  const forwarded = new Headers(request.headers);
  forwarded.set('x-path-query', request.nextUrl.pathname + request.nextUrl.search);
  let response = NextResponse.next({ request: { headers: forwarded } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: forwarded } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Boundary rules live in isGatedPath: /app, /me and /setup, not /apple-icon or /setup-guide.
  if (!user && isGatedPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    // A demo user is deleted after 24 hours; this browser remembers it had one.
    if (request.cookies.has(DEMO_COOKIE)) loginUrl.searchParams.set('demo', 'expired');
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // sw.js and the manifest are excluded because the browser re-fetches the
  // service worker on every update check, and each pass through this proxy is a
  // full supabase.auth.getUser() network round trip. Neither file is ever
  // user-specific, and neither is an /app route, so the auth gate has nothing
  // to decide about them.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
