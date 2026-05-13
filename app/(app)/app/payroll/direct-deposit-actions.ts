'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import {
  decrypt, encrypt, encryptJSON, decryptJSON,
  generateOTP, generateSalt, hashOTP, maskAccount,
  validateRoutingNumber, verifyOTP,
} from '@/lib/direct-deposit/crypto';
import { maskPhone, sendConfirmationSms, sendOTPSms } from '@/lib/direct-deposit/sms';

const OTP_TTL_MS        = 10 * 60 * 1000;
const MAX_ATTEMPTS      = 3;
const MAX_CODES_PER_HOUR = 5;

const CONSENT_TEXT =
  'I authorize my employer to initiate ACH credit entries to the bank account I have provided ' +
  'and to adjust for any credits made in error. This authorization remains in effect until ' +
  'I notify my employer in writing to cancel it.';

// ── Public types ──────────────────────────────────────────────────────────────

export type DDAccount = {
  id: string;
  employee_id: string;
  account_last4: string;
  bank_name: string;
  account_type: 'checking' | 'savings';
  deposit_type: 'full' | 'percentage' | 'fixed_amount';
  deposit_value: number | null;
  priority: number;
  is_active: boolean;
  prenote_sent_at: string | null;
  created_at: string;
};

export type AccountInput = {
  routingNumber: string;
  accountNumber: string;
  bankName: string;
  accountType: 'checking' | 'savings';
  depositType: 'full' | 'percentage' | 'fixed_amount';
  depositValue?: number | null;
  priority?: number;
};

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getAllDirectDepositAccounts(): Promise<Record<string, DDAccount[]>> {
  const { org } = await getCurrentOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from('direct_deposit_accounts')
    .select('id,employee_id,account_last4,bank_name,account_type,deposit_type,deposit_value,priority,is_active,prenote_sent_at,created_at')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .order('priority');

  const map: Record<string, DDAccount[]> = {};
  for (const row of (data ?? []) as DDAccount[]) {
    (map[row.employee_id] ??= []).push(row);
  }
  return map;
}

// ── Step 1: initiate (validates + sends SMS) ──────────────────────────────────

export async function initiateDirectDeposit(
  employeeId: string,
  input: AccountInput,
): Promise<{ verificationId: string; phoneLast4: string; expiresInSec: number }> {
  const { org } = await getCurrentOrg();

  // Validate bank details
  if (!validateRoutingNumber(input.routingNumber))
    throw new Error('Invalid routing number — please check the 9-digit ABA routing number.');
  if (!/^\d{1,17}$/.test(input.accountNumber))
    throw new Error('Account number must be 1–17 digits.');
  if (!input.bankName?.trim())
    throw new Error('Bank name is required.');
  if (input.depositType === 'percentage' && (!input.depositValue || input.depositValue < 1 || input.depositValue > 100))
    throw new Error('Percentage must be between 1 and 100.');
  if (input.depositType === 'fixed_amount' && (!input.depositValue || input.depositValue < 1))
    throw new Error('Fixed amount must be at least $0.01.');

  // Require a phone number for SMS 2FA
  const settings = (org.bar_settings ?? {}) as Record<string, unknown>;
  const phone = settings.admin_phone as string | undefined;
  if (!phone) throw new Error('NO_PHONE');

  const admin = createAdminClient();

  // Rate limit: max 5 codes per hour
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from('dd_verification_codes')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('employee_id', employeeId)
    .gte('created_at', hourAgo);
  if ((count ?? 0) >= MAX_CODES_PER_HOUR)
    throw new Error('Too many verification codes requested. Please wait before trying again.');

  // Supersede any existing unused codes for this employee
  await admin
    .from('dd_verification_codes')
    .update({ is_used: true })
    .eq('organization_id', org.id)
    .eq('employee_id', employeeId)
    .eq('is_used', false);

  // Generate OTP, hash it, encrypt the intent
  const rawCode         = generateOTP();
  const salt            = generateSalt();
  const codeHash        = hashOTP(rawCode, salt);
  const intentEncrypted = encryptJSON({ input, employeeId, action: 'add' });

  const { data: record, error } = await admin
    .from('dd_verification_codes')
    .insert({
      organization_id:  org.id,
      employee_id:      employeeId,
      code_hash:        codeHash,
      code_salt:        salt,
      action:           'add',
      intent_encrypted: intentEncrypted,
      phone_last4:      maskPhone(phone),
      expires_at:       new Date(Date.now() + OTP_TTL_MS).toISOString(),
    })
    .select('id')
    .single();

  if (error || !record) throw new Error('Failed to create verification session.');

  // Send SMS — if this throws the caller shows an error and the record is abandoned
  await sendOTPSms(phone, rawCode);

  await admin.from('dd_audit_log').insert({
    organization_id: org.id,
    employee_id:     employeeId,
    action:          'OTP_ISSUED',
    after_state:     { phone_last4: maskPhone(phone), action: 'add' },
  });

  return { verificationId: record.id, phoneLast4: maskPhone(phone), expiresInSec: OTP_TTL_MS / 1000 };
}

// ── Step 2: verify + commit ───────────────────────────────────────────────────

export async function verifyAndCommit(
  verificationId: string,
  code: string,
): Promise<DDAccount> {
  const { org } = await getCurrentOrg();
  const admin   = createAdminClient();

  const { data: rec } = await admin
    .from('dd_verification_codes')
    .select('*')
    .eq('id', verificationId)
    .eq('organization_id', org.id)
    .single();

  if (!rec)            throw new Error('Verification session not found.');
  if (rec.is_used)     throw new Error('This code has already been used.');
  if (new Date(rec.expires_at) < new Date()) {
    await admin.from('dd_verification_codes').update({ is_used: true }).eq('id', verificationId);
    throw new Error('Code expired. Request a new one.');
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await admin.from('dd_verification_codes').update({ is_used: true }).eq('id', verificationId);
    throw new Error('Maximum attempts exceeded. Request a new code.');
  }

  // Increment attempts BEFORE checking — prevents race-condition replay
  await admin.from('dd_verification_codes').update({ attempts: rec.attempts + 1 }).eq('id', verificationId);

  if (!verifyOTP(code, rec.code_salt, rec.code_hash)) {
    const remaining = MAX_ATTEMPTS - rec.attempts - 1;
    await admin.from('dd_audit_log').insert({
      organization_id: org.id, employee_id: rec.employee_id,
      action: 'OTP_FAILED', after_state: { attempts: rec.attempts + 1, remaining },
    });
    throw new Error(`Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
  }

  await admin.from('dd_verification_codes').update({ is_used: true, verified_at: new Date().toISOString() }).eq('id', verificationId);

  const { input, employeeId } =
    decryptJSON<{ input: AccountInput; employeeId: string }>(rec.intent_encrypted);

  // Deactivate any existing account at the same priority slot
  await admin
    .from('direct_deposit_accounts')
    .update({ is_active: false })
    .eq('organization_id', org.id)
    .eq('employee_id', employeeId)
    .eq('priority', input.priority ?? 1)
    .eq('is_active', true);

  const { data: account, error } = await admin
    .from('direct_deposit_accounts')
    .insert({
      organization_id:   org.id,
      employee_id:       employeeId,
      routing_encrypted: encrypt(input.routingNumber),
      account_encrypted: encrypt(input.accountNumber),
      account_last4:     maskAccount(input.accountNumber),
      bank_name:         input.bankName.trim(),
      account_type:      input.accountType,
      deposit_type:      input.depositType,
      deposit_value:     input.depositValue ?? null,
      priority:          input.priority ?? 1,
      prenote_sent_at:   new Date().toISOString(),
      consent_text:      CONSENT_TEXT,
    })
    .select('id,employee_id,account_last4,bank_name,account_type,deposit_type,deposit_value,priority,is_active,prenote_sent_at,created_at')
    .single();

  if (error || !account) throw new Error(`Failed to save account: ${error?.message}`);

  await admin.from('dd_audit_log').insert({
    organization_id: org.id,
    employee_id:     employeeId,
    action:          'ACCOUNT_ADDED',
    after_state:     { bank_name: input.bankName, account_last4: maskAccount(input.accountNumber), account_type: input.accountType },
    code_id:         verificationId,
  });

  // Non-critical confirmation SMS
  const phone = ((org.bar_settings ?? {}) as Record<string, unknown>).admin_phone as string | undefined;
  if (phone) sendConfirmationSms(phone, 'add', maskAccount(input.accountNumber));

  revalidatePath('/app/payroll');
  return account as DDAccount;
}

// ── Delete flow ───────────────────────────────────────────────────────────────

export async function initiateDeleteAccount(
  employeeId: string,
  accountId: string,
): Promise<{ verificationId: string; phoneLast4: string }> {
  const { org } = await getCurrentOrg();
  const settings = (org.bar_settings ?? {}) as Record<string, unknown>;
  const phone = settings.admin_phone as string | undefined;
  if (!phone) throw new Error('NO_PHONE');

  const admin = createAdminClient();

  const { data: acct } = await admin
    .from('direct_deposit_accounts')
    .select('id, account_last4, bank_name')
    .eq('id', accountId)
    .eq('organization_id', org.id)
    .eq('employee_id', employeeId)
    .single();
  if (!acct) throw new Error('Account not found.');

  await admin.from('dd_verification_codes')
    .update({ is_used: true })
    .eq('organization_id', org.id).eq('employee_id', employeeId).eq('is_used', false);

  const rawCode = generateOTP();
  const salt    = generateSalt();

  const { data: rec } = await admin.from('dd_verification_codes').insert({
    organization_id:  org.id,
    employee_id:      employeeId,
    code_hash:        hashOTP(rawCode, salt),
    code_salt:        salt,
    action:           'delete',
    intent_encrypted: encryptJSON({ accountId, employeeId, action: 'delete', account_last4: acct.account_last4 }),
    phone_last4:      maskPhone(phone),
    expires_at:       new Date(Date.now() + OTP_TTL_MS).toISOString(),
  }).select('id').single();

  if (!rec) throw new Error('Failed to create verification session.');
  await sendOTPSms(phone, rawCode);
  return { verificationId: rec.id, phoneLast4: maskPhone(phone) };
}

export async function verifyAndDelete(
  verificationId: string,
  code: string,
): Promise<void> {
  const { org } = await getCurrentOrg();
  const admin   = createAdminClient();

  const { data: rec } = await admin.from('dd_verification_codes').select('*').eq('id', verificationId).eq('organization_id', org.id).single();
  if (!rec || rec.is_used) throw new Error('Verification session invalid.');
  if (new Date(rec.expires_at) < new Date()) throw new Error('Code expired. Request a new one.');
  if (rec.attempts >= MAX_ATTEMPTS) throw new Error('Maximum attempts exceeded.');

  await admin.from('dd_verification_codes').update({ attempts: rec.attempts + 1 }).eq('id', verificationId);

  if (!verifyOTP(code, rec.code_salt, rec.code_hash)) {
    const remaining = MAX_ATTEMPTS - rec.attempts - 1;
    throw new Error(`Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
  }

  await admin.from('dd_verification_codes').update({ is_used: true, verified_at: new Date().toISOString() }).eq('id', verificationId);

  const { accountId, employeeId, account_last4 } =
    decryptJSON<{ accountId: string; employeeId: string; account_last4: string }>(rec.intent_encrypted);

  const { data: before } = await admin.from('direct_deposit_accounts').select('account_last4, bank_name').eq('id', accountId).single();
  await admin.from('direct_deposit_accounts').update({ is_active: false }).eq('id', accountId).eq('organization_id', org.id);

  await admin.from('dd_audit_log').insert({
    organization_id: org.id,
    employee_id:     employeeId,
    action:          'ACCOUNT_DELETED',
    before_state:    before,
    code_id:         verificationId,
  });

  const phone = ((org.bar_settings ?? {}) as Record<string, unknown>).admin_phone as string | undefined;
  if (phone) sendConfirmationSms(phone, 'delete', account_last4);

  revalidatePath('/app/payroll');
}

// ── Phone management ──────────────────────────────────────────────────────────

export async function saveAdminPhone(phone: string): Promise<void> {
  if (!/^\+\d{10,15}$/.test(phone.trim()))
    throw new Error('Phone must be in E.164 format, e.g. +15555550100');

  const { org } = await getCurrentOrg();
  const admin   = createAdminClient();
  const current = (org.bar_settings ?? {}) as Record<string, unknown>;
  await admin
    .from('organizations')
    .update({ bar_settings: { ...current, admin_phone: phone.trim() } })
    .eq('id', org.id);
  revalidatePath('/app/payroll');
}
