// Builds the OpenAPI 3.1 document from API_OPERATIONS. Output is committed at docs/api/openapi.json.
import { z } from 'zod';
import { API_OPERATIONS, ApiErrorBodySchema } from './contract';
import { API_ERROR_STATUS } from './envelope';

const schema = (s: z.ZodType) => {
  const out = z.toJSONSchema(s, { target: 'draft-2020-12', io: 'output', unrepresentable: 'any' }) as Record<string, unknown>;
  delete out.$schema;
  return out;
};
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (s: unknown) => ({ 'application/json': { schema: s } });

export function buildOpenApiDocument() {
  const statuses = [...new Set(Object.values(API_ERROR_STATUS))].sort();
  const responses: Record<string, unknown> = {};
  for (const st of statuses) {
    const names = Object.entries(API_ERROR_STATUS).filter(([, v]) => v === st).map(([k]) => k).join(', ');
    responses[`Error${st}`] = {
      description: `Error envelope. Codes: ${names}.`,
      headers: { 'X-Request-Id': { $ref: '#/components/headers/XRequestId' }, ...(st === 429 ? { 'Retry-After': { $ref: '#/components/headers/RetryAfter' } } : {}) },
      content: json(ref('ApiErrorBody')),
    };
  }

  const schemas: Record<string, unknown> = { ApiErrorBody: schema(ApiErrorBodySchema) };
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of API_OPERATIONS) {
    const name = op.path.split('/').slice(3).join('-') || 'root';
    const cap = name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());
    schemas[`${cap}Response`] = schema(op.response);
    if (op.request) schemas[`${cap}Request`] = schema(op.request);
    const errStatuses = [...new Set([...op.errors.map((e) => API_ERROR_STATUS[e]), 429, 500])].sort();
    paths[op.path] = {
      ...paths[op.path],
      [op.method]: {
        summary: op.summary,
        operationId: `${op.method}${cap}`,
        'x-status': op.status,
        security: op.auth === 'bearer' ? [{ bearer: [] }] : [],
        parameters: [{ $ref: '#/components/parameters/XRequestId' }],
        ...(op.request ? { requestBody: { required: true, content: json(ref(`${cap}Request`)) } } : {}),
        responses: {
          '200': { description: 'Success', content: json(ref(`${cap}Response`)) },
          ...Object.fromEntries(errStatuses.map((s) => [String(s), { $ref: `#/components/responses/Error${s}` }])),
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: { title: 'Rail API', version: '1.0.0', description: 'v1 contract for the native app. Operations marked x-status: contract-only are specified but not implemented.' },
    servers: [{ url: 'https://api.example.com', description: 'Placeholder; set by the owner.' }],
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      parameters: {
        XRailOrg: { name: 'X-Rail-Org', in: 'header', required: false, description: 'Organization id. Must be one the caller belongs to.', schema: { type: 'string', format: 'uuid' } },
        IdempotencyKey: { name: 'Idempotency-Key', in: 'header', required: false, description: 'Client-minted UUID required on every write.', schema: { type: 'string', format: 'uuid' } },
        XRequestId: { name: 'X-Request-Id', in: 'header', required: false, description: 'Optional correlation id; echoed or minted.', schema: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,128}$' } },
      },
      headers: {
        XRequestId: { description: 'Correlation id.', schema: { type: 'string' } },
        RetryAfter: { description: 'Seconds to wait.', schema: { type: 'integer', minimum: 1 } },
      },
      responses,
      schemas,
    },
  };
}
