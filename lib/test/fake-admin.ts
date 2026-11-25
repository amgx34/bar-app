/**
 * A recording stand-in for the Supabase admin client.
 *
 * Every awaited query chain becomes one entry in `calls`, in await order, with
 * its table, operation, payload and filters. Tests answer queries through
 * `respond` and then assert on the ordered log. It is a recorder, not a
 * database: it proves WHICH statements a handler issued, never what Postgres
 * would do with them.
 */

export type Reply = { data?: unknown; error?: { message: string } | null };

export type QueryCall = {
  table: string;
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete';
  columns?: string;
  returning?: string;
  payload?: unknown;
  opts?: unknown;
  filters: string[];
  single: boolean;
};
export type RpcCall = { rpc: string; args: unknown };
export type Call = QueryCall | RpcCall;

export type Respond = (call: Call) => Reply | undefined;

export function createFakeAdmin(respond: Respond = () => undefined) {
  const calls: Call[] = [];

  function answer(call: Call): Reply {
    const r = respond(call) ?? {};
    return { data: r.data ?? null, error: r.error ?? null };
  }

  function from(table: string) {
    const q: QueryCall = { table, op: 'select', filters: [], single: false };
    let opSet = false;
    const b: Record<string, unknown> = {};
    const setOp = (op: QueryCall['op'], payload?: unknown, opts?: unknown) => {
      q.op = op;
      q.payload = payload;
      if (opts !== undefined) q.opts = opts;
      opSet = true;
      return b;
    };
    b.select = (cols?: string) => {
      if (opSet) q.returning = cols;
      else q.columns = cols;
      return b;
    };
    b.insert = (p: unknown, o?: unknown) => setOp('insert', p, o);
    b.upsert = (p: unknown, o?: unknown) => setOp('upsert', p, o);
    b.update = (p: unknown, o?: unknown) => setOp('update', p, o);
    b.delete = () => setOp('delete');
    b.eq = (c: string, v: unknown) => (q.filters.push(`eq ${c}=${JSON.stringify(v)}`), b);
    b.in = (c: string, v: unknown) => (q.filters.push(`in ${c}=${JSON.stringify(v)}`), b);
    b.single = () => ((q.single = true), b);
    b.then = (resolve: (r: Reply) => unknown, reject?: (e: unknown) => unknown) => {
      calls.push(q);
      return Promise.resolve(answer(q)).then(resolve, reject);
    };
    return b;
  }

  const client = {
    from,
    rpc: (rpc: string, args: unknown) => {
      const c: RpcCall = { rpc, args };
      calls.push(c);
      return Promise.resolve(answer(c));
    },
  };

  return { calls, client };
}
