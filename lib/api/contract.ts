// v1 wire contract. Source of truth for docs/api/openapi.json and the shared Swift fixtures.
import { z } from 'zod';
import type { Role } from '../permissions';
import type { Destination } from '../nav/destinations';
import { API_ERROR_STATUS, type ApiErrorCode } from './envelope';
import { parseWireDecimal } from './decimal';

// ── Decimal strings: canonical form checked by decimal.ts, scale by regex ──
const decimal = (places: 2 | 4) =>
  z.string()
    .regex(new RegExp(`^-?\\d+\\.\\d{${places}}$`), `decimal string with exactly ${places} places`)
    .refine((s) => parseWireDecimal(s).ok, 'not a canonical decimal');
export const MoneyString = decimal(2);
export const QuantityString = decimal(4);
export type MoneyString = z.infer<typeof MoneyString>;
export type QuantityString = z.infer<typeof QuantityString>;

export const InstantSchema = z.iso.datetime({ offset: true });
export const BusinessDateSchema = z.iso.date();
export const IdSchema = z.uuid();

// ── Enums: values mirror lib/org.ts (Role) and lib/nav/destinations.ts; the type checks below fail tsc on drift ──
export const ROLES = ['owner', 'manager', 'accountant'] as const;
export const DESTINATIONS = ['today', 'stock', 'sales', 'team-pay', 'books'] as const;
export const RoleSchema = z.enum(ROLES);
export const DestinationSchema = z.enum(DESTINATIONS);
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const _roleMatches: Same<z.infer<typeof RoleSchema>, Role> = true;
export const _destinationsMatch: [z.infer<typeof DestinationSchema>] extends [Destination] ? true : never = true;

// ── Envelope ──
const codes = Object.keys(API_ERROR_STATUS) as [ApiErrorCode, ...ApiErrorCode[]];
export const ApiErrorCodeSchema = z.enum(codes);
export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiErrorBodyWire = z.infer<typeof ApiErrorBodySchema>;

export const MetaSchema = z.object({ asOf: InstantSchema });
const envelope = <T extends z.ZodType>(data: T) => z.object({ data, meta: MetaSchema.optional() });

// ── Auth ──
export const UserSchema = z.object({ id: IdSchema, email: z.string() });
export const SessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: InstantSchema,
  tokenType: z.literal('bearer'),
  user: UserSchema,
});
export const SessionEnvelopeSchema = envelope(SessionSchema);
export const LoginRequestSchema = z.object({ email: z.string(), password: z.string().min(1) });
export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(1) });
export const LogoutResponseSchema = envelope(z.null());

// ── me ──
export const MembershipSchema = z.object({
  orgId: IdSchema,
  orgName: z.string(),
  role: RoleSchema,
  destinations: z.array(DestinationSchema),
});
export const StaffSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('pending') }),
  z.object({ kind: z.literal('active'), orgId: IdSchema, employeeId: IdSchema }),
]);
export const MeSchema = z.object({
  user: UserSchema,
  memberships: z.array(MembershipSchema),
  activeOrgId: IdSchema.nullable(),
  staff: StaffSchema,
});
export const MeResponseSchema = envelope(MeSchema);

export type Session = z.infer<typeof SessionSchema>;
export type Me = z.infer<typeof MeSchema>;
export type Membership = z.infer<typeof MembershipSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ── Operations table: the OpenAPI document is generated from this ──
export interface ApiOperation {
  method: 'get' | 'post';
  path: string;
  summary: string;
  auth: 'none' | 'bearer';
  orgScoped: boolean;
  request?: z.ZodType;
  response: z.ZodType;
  errors: ApiErrorCode[];
  status: 'implemented' | 'contract-only';
}

export const API_OPERATIONS: ApiOperation[] = [
  {
    method: 'get', path: '/api/v1/me', summary: 'The caller, their own memberships and the active bar. Needs no org header.',
    auth: 'bearer', orgScoped: false, response: MeResponseSchema, status: 'implemented',
    errors: ['unauthenticated', 'forbidden', 'rate_limited', 'internal'],
  },
  {
    method: 'post', path: '/api/v1/auth/login', summary: 'Sign in with email and password.',
    auth: 'none', orgScoped: false, request: LoginRequestSchema, response: SessionEnvelopeSchema, status: 'contract-only',
    errors: ['unauthenticated', 'validation_failed', 'rate_limited', 'internal'],
  },
  {
    method: 'post', path: '/api/v1/auth/refresh', summary: 'Exchange a refresh token for a new session.',
    auth: 'none', orgScoped: false, request: RefreshRequestSchema, response: SessionEnvelopeSchema, status: 'contract-only',
    errors: ['unauthenticated', 'validation_failed', 'rate_limited', 'internal'],
  },
  {
    method: 'post', path: '/api/v1/auth/logout', summary: 'Revoke the current session.',
    auth: 'bearer', orgScoped: false, response: LogoutResponseSchema, status: 'contract-only',
    errors: ['unauthenticated', 'rate_limited', 'internal'],
  },
];
