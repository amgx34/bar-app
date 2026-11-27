/**
 * Write guard for the shared sample bars. Every Supabase client the app builds
 * goes through guardClient, so a server action, API route or admin-client write
 * made on behalf of the demo visitor is refused in one place, with a calm
 * sentence and no thrown error. Reads are never touched.
 *
 * Who is "demo" is decided once, in proxy.ts, which sets the x-rail-demo header
 * from the verified session (and strips any client-sent copy). Code running
 * outside a request (cron, the seed command) has no header, so it is never
 * affected. The database trigger in the design is the second layer; this is the
 * first one and the one that also covers email, SMS and auth changes.
 */

export const DEMO_REFUSAL = 'This is the sample bar. Nothing here can be changed.';
export const DEMO_HEADER = 'x-rail-demo';
const DEFAULT_DEMO_EMAIL = 'shared-visitor@demo.example';

export const isUniversalDemoEmail = (email?: string | null) =>
  !!email && email.toLowerCase() === (process.env.DEMO_USER_EMAIL || DEFAULT_DEMO_EMAIL).toLowerCase();

/** Either kind of demo account: the shared sample visitor, or an old per-visitor one. */
export const isDemoEmail = (email?: string | null) =>
  isUniversalDemoEmail(email) || !!email?.toLowerCase().endsWith('@rail.demo');

/** proxy.ts: API writes by the demo user are refused, except entering the demo. Sign out is a server action, not an API route. */
export const blocksDemoApiWrite = (method: string, path: string) =>
  method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && path.startsWith('/api/') && path !== '/api/demo';

type Check = () => Promise<boolean>;

export async function isDemoRequest(): Promise<boolean> {
  try {
    const { headers } = await import('next/headers');
    return (await headers()).get(DEMO_HEADER) === '1';
  } catch {
    return false; // outside a request: cron, scripts
  }
}

/** For side effects that never reach a table (email, SMS). */
export async function assertNotDemo(check: Check = isDemoRequest): Promise<void> {
  if (await check()) throw new Error(DEMO_REFUSAL);
}

const refusalError = { message: DEMO_REFUSAL, code: 'DEMO_READ_ONLY', details: '', hint: '' };
const REFUSED = { data: null, error: refusalError, count: null, status: 403, statusText: 'Forbidden' };
const REFUSED_AUTH = { data: { user: null, session: null }, error: { ...refusalError, name: 'AuthError', status: 403 } };

// shortcut: any rpc not listed here is refused; list grows only for RPCs that touch no org data.
const SAFE_RPCS = new Set(['rate_limit_hit', 'rate_limit_sweep', 'prune_jsonb_payloads']);
const WRITES = new Set(['insert', 'update', 'upsert', 'delete']);
const BLOCKED_AUTH = new Set(['updateUser', 'resetPasswordForEmail']);
const BLOCKED_ADMIN = new Set(['createUser', 'updateUserById', 'deleteUser', 'generateLink', 'inviteUserByEmail']);
const BLOCKED_STORAGE = new Set(['upload', 'update', 'remove', 'move', 'copy', 'createSignedUploadUrl']);

// Refused if the check says demo OR cannot say: fail closed.
async function blocked(check: Check) {
  try { return await check(); } catch { return true; }
}

// A builder that only runs when awaited; the demo check happens at that moment.
function gateBuilder(builder: any, check: Check): any {
  const proxy: any = new Proxy(builder, {
    get(target, prop) {
      if (prop === 'then') {
        return (res?: any, rej?: any) =>
          blocked(check)
            .then((no) => (no ? REFUSED : new Promise((ok, bad) => target.then(ok, bad))))
            .then(res, rej);
      }
      if (prop === 'catch' || prop === 'finally') {
        return (...a: any[]) => new Promise((ok, bad) => proxy.then(ok, bad))[prop as 'catch'](...a);
      }
      const v = Reflect.get(target, prop);
      if (typeof v !== 'function') return v;
      return (...a: any[]) => { const r = v.apply(target, a); return r === target ? proxy : r; };
    },
  });
  return proxy;
}

const wrapMethods = (obj: any, names: Set<string>, refusal: unknown, check: Check): any =>
  new Proxy(obj, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (typeof v !== 'function') return v;
      return (...a: any[]) =>
        names.has(String(prop))
          ? blocked(check).then((no) => (no ? refusal : v.apply(target, a)))
          : v.apply(target, a);
    },
  });

export function guardClient<T extends object>(client: T, check: Check = isDemoRequest): T {
  return new Proxy(client, {
    get(target: any, prop) {
      const v = Reflect.get(target, prop);
      if (prop === 'from' || prop === 'rpc') {
        return (...a: any[]) => {
          const r = v.apply(target, a);
          if (prop === 'rpc') return SAFE_RPCS.has(a[0]) ? r : gateBuilder(r, check);
          return new Proxy(r, {
            get(t, p) {
              const f = Reflect.get(t, p);
              if (typeof f !== 'function') return f;
              return (...x: any[]) => (WRITES.has(String(p)) ? gateBuilder(f.apply(t, x), check) : f.apply(t, x));
            },
          });
        };
      }
      if (prop === 'auth' && v) {
        const auth = wrapMethods(v, BLOCKED_AUTH, REFUSED_AUTH, check);
        return new Proxy(auth, {
          get: (t, p) => (p === 'admin' && v.admin ? wrapMethods(v.admin, BLOCKED_ADMIN, REFUSED_AUTH, check) : Reflect.get(t, p)),
        });
      }
      if (prop === 'storage' && v) {
        return new Proxy(v, {
          get(t, p) {
            const f = Reflect.get(t, p);
            return p === 'from' && typeof f === 'function'
              ? (...a: any[]) => wrapMethods(f.apply(t, a), BLOCKED_STORAGE, { data: null, error: refusalError }, check)
              : f;
          },
        });
      }
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}
