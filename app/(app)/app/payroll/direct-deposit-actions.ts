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
import {
  maskPhone, maskEmail,
  sendConfirmationSms, sendOTPSms,
  sendConfirmationEmail, sendOTPEmail,
} from '@/lib/direct-deposit/sms';

const OTP_TTL_MS        = 10 * 60 * 1000;
const MAX_ATTEMPTS      = 3;
const MAX_CODES_PER_HOUR = 5;

// IMPORTANT — Rail does not originate, process, or initiate ACH transactions.
// Rail is a secure data management tool only. The bar owner is responsible for
// providing this information to their licensed payroll provider (bank, Gusto,
// ADP, Paychex, etc.) who will initiate the actual direct deposit payments.
// Rail makes no guarantees regarding payment processing or fund transfers.

const CONSENT_TEXT =
  'I authorize my employer to record and securely store my banking information ' +
  'in Rail for use with their designated payroll provider. I understand that ' +
  'Rail does not process, initiate, or guarantee any direct deposit payments — ' +
  'actual payment processing is handled by my employer\'s bank or payroll service. ' +
  'I may request removal of this information at any time by notifying my employer.';

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
): Promise<{ verificationId: string; channel: 'sms' | 'email'; hint: string; expiresInSec: number }> {
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

  const settings = (org.bar_settings ?? {}) as Record<string, unknown>;
  const phone    = settings.admin_phone as string | undefined;

  // Resolve delivery channel: SMS if phone configured, email fallback otherwise
  let channel: 'sms' | 'email' = 'sms';
  let deliveryAddress = '';

  if (phone) {
    channel         = 'sms';
    deliveryAddress = phone;
  } else {
    // Fall back to the bar owner's login email
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) throw new Error('No phone number configured and no email address found. Add a phone number in Settings to enable 2FA.');
    channel         = 'email';
    deliveryAddress = user.email;
  }

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

  // phone_last4 column stores a 4-char hint regardless of channel
  const hint4 = channel === 'sms'
    ? maskPhone(deliveryAddress)                          // last 4 digits
    : deliveryAddress.slice(0, 4).padEnd(4, '*');        // first 4 chars of email

  const { data: record, error } = await admin
    .from('dd_verification_codes')
    .insert({
      organization_id:  org.id,
      employee_id:      employeeId,
      code_hash:        codeHash,
      code_salt:        salt,
      action:           'add',
      intent_encrypted: intentEncrypted,
      phone_last4:      hint4,
      expires_at:       new Date(Date.now() + OTP_TTL_MS).toISOString(),
    })
    .select('id')
    .single();

  if (error || !record) throw new Error('Failed to create verification session.');

  // Send OTP via the resolved channel
  if (channel === 'sms') {
    await sendOTPSms(deliveryAddress, rawCode);
  } else {
    await sendOTPEmail(deliveryAddress, rawCode);
  }

  await admin.from('dd_audit_log').insert({
    organization_id: org.id,
    employee_id:     employeeId,
    action:          'OTP_ISSUED',
    after_state:     { channel, hint: hint4, action: 'add' },
  });

  const hint = channel === 'sms' ? maskPhone(deliveryAddress) : maskEmail(deliveryAddress);
  return { verificationId: record.id, channel, hint, expiresInSec: OTP_TTL_MS / 1000 };
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
    // admin-scope-ok: `rec` was fetched with .eq('organization_id', org.id) and
    // the function throws when missing, so verificationId is always in-org.
    await admin.from('dd_verification_codes').update({ is_used: true }).eq('id', verificationId);
    throw new Error('Code expired. Request a new one.');
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    // admin-scope-ok: `rec` was fetched with .eq('organization_id', org.id) and
    // the function throws when missing, so verificationId is always in-org.
    await admin.from('dd_verification_codes').update({ is_used: true }).eq('id', verificationId);
    throw new Error('Maximum attempts exceeded. Request a new code.');
  }

  // Increment attempts BEFORE checking — prevents race-condition replay
  // admin-scope-ok: reached only after the scoped `rec` lookup above succeeded.
  await admin.from('dd_verification_codes').update({ attempts: rec.attempts + 1 }).eq('id', verificationId);

  if (!verifyOTP(code, rec.code_salt, rec.code_hash)) {
    const remaining = MAX_ATTEMPTS - rec.attempts - 1;
    await admin.from('dd_audit_log').insert({
      organization_id: org.id, employee_id: rec.employee_id,
      action: 'OTP_FAILED', after_state: { attempts: rec.attempts + 1, remaining },
    });
    throw new Error(`Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
  }

  // admin-scope-ok: reached only after the scoped `rec` lookup above succeeded.
  const { input, employeeId } =
    decryptJSON<{ input: AccountInput; employeeId: string }>(rec.intent_encrypted);

  // Consuming the code, retiring the old account, inserting the replacement and
  // writing the audit row all happen in one transaction. Run as separate
  // statements, a failure partway left the employee with no active account and
  // a code already spent — payroll would have had nowhere to pay them.
  //
  // Ciphertext is produced here; DD_ENCRYPTION_KEY never reaches the database.
  const { data: account, error } = await admin
    .rpc('dd_commit_account', {
      p_org_id:            org.id,
      p_verification_id:   verificationId,
      p_employee_id:       employeeId,
      p_routing_encrypted: encrypt(input.routingNumber),
      p_account_encrypted: encrypt(input.accountNumber),
      p_account_last4:     maskAccount(input.accountNumber),
      p_bank_name:         input.bankName.trim(),
      p_account_type:      input.accountType,
      p_deposit_type:      input.depositType,
      p_deposit_value:     input.depositValue ?? null,
      p_priority:          input.priority ?? 1,
      p_consent_text:      CONSENT_TEXT,
      p_audit_after: {
        bank_name:     input.bankName,
        account_last4: maskAccount(input.accountNumber),
        account_type:  input.accountType,
      },
    })
    .single();

  if (error || !account) throw new Error(`Failed to save account: ${error?.message ?? 'unknown error'}`);

  // Non-critical confirmation — SMS if phone set, email otherwise
  const phone = ((org.bar_settings ?? {}) as Record<string, unknown>).admin_phone as string | undefined;
  if (phone) {
    sendConfirmationSms(phone, 'add', maskAccount(input.accountNumber));
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) sendConfirmationEmail(user.email, 'add', maskAccount(input.accountNumber));
  }

  revalidatePath('/app/payroll');
  return account as DDAccount;
}

// ── Delete flow ───────────────────────────────────────────────────────────────

export async function initiateDeleteAccount(
  employeeId: string,
  accountId: string,
): Promise<{ verificationId: string; channel: 'sms' | 'email'; hint: string }> {
  const { org } = await getCurrentOrg();
  const settings = (org.bar_settings ?? {}) as Record<string, unknown>;
  const phone    = settings.admin_phone as string | undefined;

  // Resolve delivery channel
  let channel: 'sms' | 'email' = 'sms';
  let deliveryAddress = '';

  if (phone) {
    channel         = 'sms';
    deliveryAddress = phone;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) throw new Error('No phone number configured and no email found. Add a phone number in Settings.');
    channel         = 'email';
    deliveryAddress = user.email;
  }

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
  const hint4   = channel === 'sms'
    ? maskPhone(deliveryAddress)
    : deliveryAddress.slice(0, 4).padEnd(4, '*');

  const { data: rec } = await admin.from('dd_verification_codes').insert({
    organization_id:  org.id,
    employee_id:      employeeId,
    code_hash:        hashOTP(rawCode, salt),
    code_salt:        salt,
    action:           'delete',
    intent_encrypted: encryptJSON({ accountId, employeeId, action: 'delete', account_last4: acct.account_last4 }),
    phone_last4:      hint4,
    expires_at:       new Date(Date.now() + OTP_TTL_MS).toISOString(),
  }).select('id').single();

  if (!rec) throw new Error('Failed to create verification session.');

  if (channel === 'sms') {
    await sendOTPSms(deliveryAddress, rawCode);
  } else {
    await sendOTPEmail(deliveryAddress, rawCode);
  }

  const hint = channel === 'sms' ? maskPhone(deliveryAddress) : maskEmail(deliveryAddress);
  return { verificationId: rec.id, channel, hint };
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

  // admin-scope-ok: reached only after the scoped `rec` lookup above succeeded.
  await admin.from('dd_verification_codes').update({ attempts: rec.attempts + 1 }).eq('id', verificationId);

  if (!verifyOTP(code, rec.code_salt, rec.code_hash)) {
    const remaining = MAX_ATTEMPTS - rec.attempts - 1;
    throw new Error(`Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
  }

  const { accountId, account_last4 } =
    decryptJSON<{ accountId: string; employeeId: string; account_last4: string }>(rec.intent_encrypted);

  // One transaction: consume the code, deactivate the account, record the audit
  // entry. Previously a failure after the deactivation left a removed account
  // with no audit row — the exact record a payroll dispute turns on.
  const { error: rpcError } = await admin.rpc('dd_delete_account', {
    p_org_id:          org.id,
    p_verification_id: verificationId,
    p_account_id:      accountId,
  });

  if (rpcError) throw new Error(`Failed to remove account: ${rpcError.message}`);

  const phone = ((org.bar_settings ?? {}) as Record<string, unknown>).admin_phone as string | undefined;
  if (phone) sendConfirmationSms(phone, 'delete', account_last4);

  revalidatePath('/app/payroll');
}

// ── Export for payroll provider ───────────────────────────────────────────────
// Generates a CSV the bar owner can hand to their bank or payroll processor.
// Routing and account numbers are decrypted for this purpose only and are
// never logged or persisted outside this function call.

export async function exportBankingInfoCsv(): Promise<string> {
  const { org, role } = await getCurrentOrg();
  if (role !== 'owner') throw new Error('Only the account owner can export banking information.');

  const admin = createAdminClient();

  const { data: accounts } = await admin
    .from('direct_deposit_accounts')
    .select('employee_id, routing_encrypted, account_encrypted, account_last4, bank_name, account_type, deposit_type, deposit_value, priority')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .order('employee_id')
    .order('priority');

  if (!accounts?.length) return '';

  const { data: employees } = await admin
    .from('employees')
    .select('id, name')
    .eq('organization_id', org.id);

  const empNameById = new Map((employees ?? []).map(e => [e.id, e.name]));

  const rows = [
    ['Employee Name', 'Routing Number', 'Account Number', 'Bank Name', 'Account Type', 'Deposit Type', 'Deposit Value', 'Priority'],
    ...(accounts.map(a => [
      empNameById.get(a.employee_id) ?? a.employee_id,
      decrypt(a.routing_encrypted),
      decrypt(a.account_encrypted),
      a.bank_name,
      a.account_type,
      a.deposit_type,
      a.deposit_value?.toString() ?? '',
      a.priority.toString(),
    ])),
  ];

  await admin.from('dd_audit_log').insert({
    organization_id: org.id,
    employee_id:     org.id, // org-level action
    action:          'BANKING_INFO_EXPORTED',
    after_state:     { record_count: accounts.length, exported_by_role: role },
  });

  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
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
