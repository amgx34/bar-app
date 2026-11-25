import { handleMe } from '@/lib/api/me';
import { requestIdFrom, toResponse } from '@/lib/api/envelope';
import { parseBearer } from '@/lib/api/bearer';
import { createBearerClient } from '@/lib/supabase/bearer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  // Placeholder client when there is no token: handleMe 401s before touching it.
  const client = createBearerClient(parseBearer(authorization) ?? '');
  const result = await handleMe({
    authorization,
    requestedOrg: request.headers.get('x-rail-org'),
    requestId: requestIdFrom(request.headers),
    now: () => new Date(),
    verify: async (token) => {
      const { data, error } = await client.auth.getUser(token);
      const u = data?.user;
      if (error || !u?.id) return { user: null };
      return { user: { id: u.id, email: u.email ?? '' } };
    },
    load: async (userId) => {
      const [m, a] = await Promise.all([
        client.from('memberships').select('user_id, organization_id, role, created_at, organizations(id, name)').eq('user_id', userId),
        client.from('employee_accounts').select('organization_id, employee_id, status, employees(name)').eq('user_id', userId).maybeSingle(),
      ]);
      if (m.error || a.error) throw new Error('load failed');
      return { membershipRows: (m.data ?? []) as never, accountRow: a.data as never };
    },
  });
  return toResponse(result);
}
