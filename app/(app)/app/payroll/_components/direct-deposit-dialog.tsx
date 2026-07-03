'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Sparkles, Shield, CheckCircle, Loader2, Eye, EyeOff,
  AlertTriangle, RotateCcw, Banknote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import {
  initiateDirectDeposit,
  initiateDeleteAccount,
  verifyAndCommit,
  verifyAndDelete,
} from '../direct-deposit-actions';
import type { DDAccount } from '../direct-deposit-actions';

type DialogMode = 'add' | 'delete';
type Step = 'form' | 'otp' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: DialogMode;
  employeeId: string;
  employeeName: string;
  existingAccount?: DDAccount | null;   // for delete mode
  onSuccess: (account?: DDAccount) => void;
}

const DEPOSIT_TYPES = [
  { value: 'full', label: 'Full paycheck — 100% deposited here' },
  { value: 'percentage', label: 'Percentage split' },
  { value: 'fixed_amount', label: 'Fixed amount (remainder elsewhere)' },
] as const;

export function DirectDepositDialog({
  open, onOpenChange, mode, employeeId, employeeName, existingAccount, onSuccess,
}: Props) {
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [verificationId, setVerificationId] = useState('');
  const [channel,  setChannel]  = useState<'sms' | 'email'>('sms');
  const [hint,     setHint]     = useState('');
  const [showAccount, setShowAccount] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Form state
  const [routing, setRouting]         = useState('');
  const [account, setAccount]         = useState('');
  const [bankName, setBankName]       = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [depositType, setDepositType] = useState<'full' | 'percentage' | 'fixed_amount'>('full');
  const [depositValue, setDepositValue] = useState('');
  const [consented, setConsented]     = useState(false);

  function resetDialog() {
    setStep('form');
    setLoading(false);
    setVerificationId('');
    setOtpDigits(['', '', '', '', '', '']);
    setRouting(''); setAccount(''); setBankName('');
    setAccountType('checking'); setDepositType('full');
    setDepositValue(''); setConsented(false);
  }

  function handleClose(v: boolean) {
    if (!v) resetDialog();
    onOpenChange(v);
  }

  // ── Step 1: submit form ───────────────────────────────────────────────────

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!consented) { toast.error('You must accept the authorization to continue'); return; }
    setLoading(true);
    try {
      if (mode === 'delete' && existingAccount) {
        const res = await initiateDeleteAccount(employeeId, existingAccount.id);
        setVerificationId(res.verificationId);
        setChannel(res.channel);
        setHint(res.hint);
        setStep('otp');
      } else {
        const res = await initiateDirectDeposit(employeeId, {
          routingNumber: routing,
          accountNumber: account,
          bankName,
          accountType,
          depositType,
          depositValue: depositValue ? Number(depositValue) : undefined,
          priority: 1,
        });
        setVerificationId(res.verificationId);
        setChannel(res.channel);
        setHint(res.hint);
        setStep('otp');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP ────────────────────────────────────────────────────

  const fullCode = otpDigits.join('');

  async function handleVerify() {
    if (fullCode.length !== 6) { toast.error('Enter all 6 digits'); return; }
    setLoading(true);
    try {
      if (mode === 'delete') {
        await verifyAndDelete(verificationId, fullCode);
        onSuccess();
      } else {
        const saved = await verifyAndCommit(verificationId, fullCode);
        onSuccess(saved);
      }
      setStep('done');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  function handleOTPInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...otpDigits];
    next[index] = value.slice(-1);
    setOtpDigits(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOTPKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0)
      otpRefs.current[index - 1]?.focus();
  }

  function handleOTPPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtpDigits(pasted.split(''));
      otpRefs.current[5]?.focus();
      e.preventDefault();
    }
  }

  const isDelete = mode === 'delete';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            {isDelete ? 'Remove Direct Deposit' : 'Set Up Direct Deposit'}
          </DialogTitle>
          <DialogDescription>
            {isDelete
              ? `Remove the bank account for ${employeeName}`
              : `Add a bank account for ${employeeName}`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Form step ──────────────────────────────────────────────────── */}
        {step === 'form' && (
          <form onSubmit={handleSubmitForm} className="space-y-4">
            {isDelete && existingAccount ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-1">
                <p className="text-sm font-medium text-red-400">Remove this account?</p>
                <p className="text-sm text-muted-foreground">
                  {existingAccount.bank_name} — {existingAccount.account_type} ••••{existingAccount.account_last4}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  You will receive an SMS code to confirm this removal.
                </p>
              </div>
            ) : (
              <>
                {/* Bank details */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Bank Name</Label>
                    <Input required placeholder="e.g. Chase Bank" value={bankName} onChange={e => setBankName(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Routing Number (9 digits)</Label>
                    <Input
                      required maxLength={9} pattern="\d{9}" inputMode="numeric"
                      placeholder="021000021"
                      value={routing}
                      onChange={e => setRouting(e.target.value.replace(/\D/g, '').slice(0, 9))}
                      className="h-9 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Account Number</Label>
                    <div className="relative">
                      <Input
                        required maxLength={17} inputMode="numeric"
                        type={showAccount ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={account}
                        onChange={e => setAccount(e.target.value.replace(/\D/g, '').slice(0, 17))}
                        className="h-9 font-mono pr-9"
                      />
                      <button type="button" onClick={() => setShowAccount(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showAccount ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Account Type</Label>
                    <Select value={accountType} onValueChange={v => setAccountType(v as 'checking' | 'savings')}>
                      <SelectTrigger className="h-9">
                        <span className="text-sm capitalize">{accountType}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Deposit Type</Label>
                    <Select value={depositType} onValueChange={v => setDepositType(v as typeof depositType)}>
                      <SelectTrigger className="h-9">
                        <span className="text-sm truncate">{DEPOSIT_TYPES.find(d => d.value === depositType)?.label ?? depositType}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {DEPOSIT_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {depositType !== 'full' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{depositType === 'percentage' ? 'Percentage (1–100)' : 'Amount (cents)'}</Label>
                      <Input
                        required type="number"
                        min={1} max={depositType === 'percentage' ? 100 : undefined}
                        value={depositValue}
                        onChange={e => setDepositValue(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Consent */}
            <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-primary/20 bg-primary/5 p-3">
              <input
                type="checkbox"
                checked={consented}
                onChange={e => setConsented(e.target.checked)}
                className="rounded mt-0.5 shrink-0"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                {isDelete
                  ? 'I authorize the removal of this direct deposit account.'
                  : 'I authorize my employer to initiate ACH credit entries to the bank account provided. This authorization remains in effect until I notify my employer in writing to cancel it.'}
              </span>
            </label>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading || !consented} className="flex-1 gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                {loading ? 'Sending code…' : 'Send Verification Code'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
            </div>
          </form>
        )}

        {/* ── OTP step ────────────────────────────────────────────────────── */}
        {step === 'otp' && (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">Check your phone</p>
                <p className="text-xs text-muted-foreground">
                  {channel === 'sms'
                    ? <>A 6-digit code was sent via <strong>SMS</strong> to the number ending in <strong>••••{hint}</strong>.</>
                    : <>A 6-digit code was sent to <strong>{hint}</strong> via email. Check your inbox.</>
                  }{' '}Expires in 10 minutes.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-center block">Enter verification code</Label>
              <div className="flex justify-center gap-2" onPaste={handleOTPPaste}>
                {otpDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleOTPInput(i, e.target.value)}
                    onKeyDown={e => handleOTPKeyDown(i, e)}
                    className="h-12 w-10 rounded-md border border-input bg-background text-center text-xl font-bold tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleVerify}
                disabled={loading || fullCode.length !== 6}
                className="flex-1 gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {loading ? 'Verifying…' : 'Confirm'}
              </Button>
              <Button variant="ghost" onClick={() => setStep('form')} className="gap-1.5 text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" /> Back
              </Button>
            </div>
          </div>
        )}

        {/* ── Done step ───────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold">
                {isDelete ? 'Account removed' : 'Direct deposit saved'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {isDelete
                  ? 'The bank account has been removed successfully.'
                  : 'A pre-note (zero-dollar test) will be sent before the first live deposit.'}
              </p>
            </div>
            <Button onClick={() => handleClose(false)} className="w-full">Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
