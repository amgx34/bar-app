'use client';

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { Bell, X, CheckCheck, Trash2, ExternalLink, RefreshCw, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getBarMessages, markMessageRead, markAllMessagesRead,
  deleteMessage, approveOrderReply, denyOrderReply,
} from '../actions/messages';
import type { BarMessage, BreakdownItem } from '../actions/messages';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  denied:   { label: 'Denied',   cls: 'bg-red-100 dark:bg-red-900/40 text-red-600' },
} as const;

// ── AI Breakdown table ────────────────────────────────────────────────────────

function BreakdownTable({ rows }: { rows: BreakdownItem[] }) {
  if (!rows.length) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded border text-xs">
      <table className="w-full">
        <thead className="bg-muted/60">
          <tr>
            <th className="text-left px-2 py-1.5 font-medium">Item</th>
            <th className="text-right px-2 py-1.5 font-medium">Qty</th>
            <th className="text-right px-2 py-1.5 font-medium">Unit $</th>
            <th className="text-right px-2 py-1.5 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="px-2 py-1.5">{r.item}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.quantity}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {r.unit_price != null ? fmtMoney(r.unit_price) : '—'}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                {r.line_total != null ? fmtMoney(r.line_total) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Single message row ────────────────────────────────────────────────────────

function MessageRow({
  msg, expanded, onOpen, onDelete, onApprove, onDeny,
}: {
  msg:       BarMessage;
  expanded:  boolean;
  onOpen:    (m: BarMessage) => void;
  onDelete:  (id: string) => void;
  onApprove: (id: string) => void;
  onDeny:    (id: string) => void;
}) {
  const isReply  = msg.message_type === 'order_reply';
  const status   = STATUS_CONFIG[msg.message_status] ?? STATUS_CONFIG.pending;
  const isPending = msg.message_status === 'pending';

  return (
    <div className={cn(
      'border-b last:border-0 transition-colors',
      msg.is_read ? 'bg-card' : 'bg-primary/5',
      expanded ? 'bg-muted/30' : 'cursor-pointer hover:bg-muted/20',
    )}>
      {/* Collapsed header */}
      <div className="flex items-start gap-3 px-4 py-3" onClick={() => onOpen(msg)}>
        <div className="mt-1.5 shrink-0 w-2 h-2">
          {!msg.is_read && <div className="w-2 h-2 rounded-full bg-primary" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={cn('text-sm truncate', !msg.is_read && 'font-semibold')}>
              {msg.sender_name}
            </p>
            <span className="text-xs text-muted-foreground shrink-0">{timeAgo(msg.created_at)}</span>
          </div>

          <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.subject}</p>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Requested / total amount */}
            {msg.requested_amount != null && msg.requested_amount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold px-2 py-0.5">
                <DollarSign className="h-3 w-3" />
                {fmtMoney(msg.requested_amount)} total
              </span>
            )}
            {/* Status badge (order replies only) */}
            {isReply && (
              <span className={cn('rounded-full text-[10px] font-semibold px-2 py-0.5', status.cls)}>
                {status.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 pb-4 space-y-3">
          {/* AI-parsed breakdown */}
          {msg.ai_breakdown && msg.ai_breakdown.length > 0 && (
            <div className="pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Price Breakdown (AI-parsed)
              </p>
              <BreakdownTable rows={msg.ai_breakdown} />
              {msg.requested_amount != null && msg.requested_amount > 0 && (
                <p className="text-right text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-1.5 pr-1">
                  Order Total: {fmtMoney(msg.requested_amount)}
                </p>
              )}
            </div>
          )}

          {/* Body / notes */}
          {msg.body && (
            <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border text-xs leading-relaxed whitespace-pre-wrap">
              {msg.body}
            </p>
          )}

          {/* Extra fields */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            {msg.sender_email && (
              <>
                <span className="text-muted-foreground">From</span>
                <a href={`mailto:${msg.sender_email}`} className="text-primary hover:underline truncate">{msg.sender_email}</a>
              </>
            )}
            {msg.request_type && (
              <>
                <span className="text-muted-foreground">Type</span>
                <span>{msg.request_type}</span>
              </>
            )}
          </div>

          {/* Approve / Deny — only for pending order replies */}
          {isReply && isPending && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={(e) => { e.stopPropagation(); onApprove(msg.id); }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 transition-colors"
              >
                <CheckCircle className="h-3.5 w-3.5" /> Approve Order
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDeny(msg.id); }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 transition-colors"
              >
                <XCircle className="h-3.5 w-3.5" /> Deny
              </button>
            </div>
          )}

          {/* Actions row */}
          <div className="flex items-center gap-3 pt-0.5">
            {msg.sender_email && (
              <a
                href={`mailto:${msg.sender_email}?subject=Re: ${encodeURIComponent(msg.subject)}`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" /> Reply
              </a>
            )}
            <button
              className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1 ml-auto"
              onClick={(e) => { e.stopPropagation(); onDelete(msg.id); }}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main bell component ───────────────────────────────────────────────────────

export function NotificationBell({ orgSlug }: { orgSlug: string }) {
  const [open,       setOpen]      = useState(false);
  const [messages,   setMessages]  = useState<BarMessage[]>([]);
  const [filter,     setFilter]    = useState<'all' | 'unread'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loaded,     setLoaded]    = useState(false);
  const [checking,   setChecking]  = useState(false);
  const [, start] = useTransition();

  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const reload = useCallback(() => {
    start(async () => {
      try {
        const msgs = await getBarMessages();
        setMessages(msgs);
        setLoaded(true);
      } catch { /* silent */ }
    });
  }, []);

  useEffect(() => {
    reload();
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  useEffect(() => {
    const id = setInterval(reload, 45_000);
    return () => clearInterval(id);
  }, [reload]);

  // ── Poll Gmail for new replies ──────────────────────────────────────────────

  async function checkForReplies() {
    setChecking(true);
    try {
      const res = await fetch('/api/email-replies', { method: 'POST' });
      const json = await res.json();
      if (json.processed > 0) reload();
    } catch { /* silent */ } finally {
      setChecking(false);
    }
  }

  // Poll automatically when panel opens
  useEffect(() => {
    if (open) checkForReplies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Click outside ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) &&
          !buttonRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // ── Message interactions ────────────────────────────────────────────────────

  async function handleOpen(msg: BarMessage) {
    setExpandedId((prev) => prev === msg.id ? null : msg.id);
    if (!msg.is_read) {
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_read: true } : m));
      await markMessageRead(msg.id);
    }
  }

  async function handleMarkAllRead() {
    setMessages((prev) => prev.map((m) => ({ ...m, is_read: true })));
    await markAllMessagesRead();
  }

  async function handleDelete(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (expandedId === id) setExpandedId(null);
    await deleteMessage(id);
  }

  async function handleApprove(id: string) {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, message_status: 'approved', is_read: true } : m));
    await approveOrderReply(id);
  }

  async function handleDeny(id: string) {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, message_status: 'denied', is_read: true } : m));
    await denyOrderReply(id);
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const unread    = messages.filter((m) => !m.is_read).length;
  const displayed = filter === 'unread' ? messages.filter((m) => !m.is_read) : messages;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        className="relative h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
      >
        <Bell className={cn('h-4 w-4', unread > 0 ? 'text-primary' : 'text-muted-foreground')} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1 leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-11 z-50 w-[400px] max-w-[95vw] rounded-xl border bg-card shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
            <h2 className="text-sm font-semibold">Inbox</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={checkForReplies}
                disabled={checking}
                title="Check Gmail for order replies"
                className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />
              </button>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex border-b bg-muted/30 text-xs">
            {(['all', 'unread'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn(
                  'flex-1 py-2 font-medium capitalize transition-colors',
                  filter === tab
                    ? 'text-primary border-b-2 border-primary -mb-px bg-card'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab === 'unread' ? `Unread${unread > 0 ? ` (${unread})` : ''}` : 'All'}
              </button>
            ))}
          </div>

          {/* Message list */}
          <div className="max-h-[460px] overflow-y-auto">
            {!loaded ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : displayed.length === 0 ? (
              <div className="px-4 py-10 text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  {filter === 'unread' ? 'No unread messages' : 'No messages yet'}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Reply emails from reps appear here automatically
                </p>
              </div>
            ) : (
              displayed.map((msg) => (
                <MessageRow
                  key={msg.id}
                  msg={msg}
                  expanded={expandedId === msg.id}
                  onOpen={handleOpen}
                  onDelete={handleDelete}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
