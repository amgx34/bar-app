import { describe, expect, it } from 'vitest';
import { API_ERROR_STATUS, fail, ok, requestIdFrom, toResponse } from './envelope';

describe('API_ERROR_STATUS', () => {
  it('holds exactly the contract codes', () => {
    expect(API_ERROR_STATUS).toEqual({
      unauthenticated: 401,
      forbidden: 403,
      no_membership: 403,
      org_required: 400,
      not_found: 404,
      validation_failed: 422,
      conflict: 409,
      stale_count: 409,
      rate_limited: 429,
      upgrade_required: 426,
      internal: 500,
    });
  });
});

describe('ok', () => {
  it('wraps data with status 200 and no meta key by default', () => {
    const r = ok({ a: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ data: { a: 1 } });
    expect('meta' in r.body).toBe(false);
    expect('error' in r.body).toBe(false);
  });
  it('carries meta when given', () => {
    expect(ok([], { asOf: '2026-11-25T00:00:00Z' }).body).toEqual({
      data: [],
      meta: { asOf: '2026-11-25T00:00:00Z' },
    });
  });
});

describe('fail', () => {
  it.each([
    ['unauthenticated', 401],
    ['forbidden', 403],
    ['not_found', 404],
    ['conflict', 409],
    ['validation_failed', 422],
  ] as const)('%s has status %i and the exact shape', (code, status) => {
    const r = fail(code, 'A readable sentence.');
    expect(r.status).toBe(status);
    expect(r.body).toEqual({ error: { code, message: 'A readable sentence.' } });
    expect('data' in r.body).toBe(false);
  });

  it('carries requestId and field-path details', () => {
    const r = fail('validation_failed', 'Fix the fields.', {
      requestId: 'req_1',
      details: { fields: [{ path: 'lines.0.qty', message: 'Must be positive' }] },
    });
    expect(r.body).toEqual({
      error: {
        code: 'validation_failed',
        message: 'Fix the fields.',
        requestId: 'req_1',
        details: { fields: [{ path: 'lines.0.qty', message: 'Must be positive' }] },
      },
    });
  });

  it('internal never leaks the passed text, a stack, or details', () => {
    const err = new Error('relation "secret_table" does not exist');
    const r = fail('internal', err.message, { requestId: 'r', details: { stack: err.stack } });
    const text = JSON.stringify(r);
    expect(r.status).toBe(500);
    expect(text).not.toContain('secret_table');
    expect(text).not.toContain('stack');
    expect(text).not.toContain('at ');
    expect(r.body).toEqual({
      error: { code: 'internal', message: expect.any(String), requestId: 'r' },
    });
    expect(fail('internal', 'x').body).toEqual(fail('internal', 'y').body);
  });

  it('rate_limited sets Retry-After, minimum 1, and a numeric retryAfter detail', () => {
    const r = fail('rate_limited', 'Slow down.', { retryAfterSeconds: 30 });
    expect(r.status).toBe(429);
    expect(r.headers['Retry-After']).toBe('30');
    expect(fail('rate_limited', 'm', { retryAfterSeconds: 0 }).headers['Retry-After']).toBe('1');
    expect(fail('rate_limited', 'm').headers['Retry-After']).toBe('1');
    expect(fail('rate_limited', 'm', { retryAfterSeconds: 2.2 }).headers['Retry-After']).toBe('3');
    expect(r.body.error.details).toEqual({ retryAfterSeconds: 30 });
  });

  it('other codes carry no Retry-After', () => {
    expect(fail('conflict', 'm').headers['Retry-After']).toBeUndefined();
  });
});

describe('toResponse', () => {
  it('builds a JSON Response with status, body and headers', async () => {
    const res = toResponse(fail('rate_limited', 'Slow down.', { retryAfterSeconds: 7, requestId: 'q' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('X-Request-Id')).toBe('q');
    expect((await res.json()).error.code).toBe('rate_limited');
  });
  it('works for success', async () => {
    const res = toResponse(ok({ x: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { x: 1 } });
  });
});

describe('requestIdFrom', () => {
  const gen = () => 'generated-id';
  it('accepts a safe caller-supplied id', () => {
    expect(requestIdFrom(new Headers({ 'X-Request-Id': 'abc-123_DEF.4' }), gen)).toBe('abc-123_DEF.4');
  });
  it.each(['', 'has space', 'new\nline', 'a'.repeat(129), '<script>', 'émoji'])(
    'generates when the supplied id is unsafe (%j)',
    (v) => {
      expect(requestIdFrom({ get: () => v }, gen)).toBe('generated-id');
    },
  );
  it('generates when absent', () => {
    expect(requestIdFrom(new Headers(), gen)).toBe('generated-id');
  });
});
