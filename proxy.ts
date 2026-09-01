import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Boundary-aware: a bare startsWith('/app') also matches /apple-icon, and
  // would match /apply or /appointments if those ever existed — sending public
  // routes to the login page purely because of a shared prefix.
  const { pathname } = request.nextUrl;
  const isAppRoute = pathname === '/app' || pathname.startsWith('/app/');

  if (!user && isAppRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
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
