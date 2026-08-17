'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BreakdownItem = {
  item:       string;
  quantity:   string;
  unit_price: number | null;
  line_total: number | null;
};

export type BarMessage = {
  id:               string;
  sender_name:      string;
  sender_email:     string | null;
  sender_company:   string | null;
  message_type:     string;                           // 'order_reply' | 'general'
  subject:          string;
  body:             string | null;
  request_type:     string | null;
  item_category:    string | null;
  item_details:     string | null;
  quantity:         string | null;
  requested_amount: number | null;
  is_read:          boolean;
  read_at:          string | null;
  created_at:       string;
  // order-reply specific
  related_order_id: string | null;
  message_status:   'pending' | 'approved' | 'denied';
  ai_breakdown:     BreakdownItem[] | null;
  gmail_message_id: string | null;
};

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getBarMessages(): Promise<BarMessage[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('bar_messages')
    .select('*')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(60);
  return (data ?? []) as BarMessage[];
}

export async function getUnreadCount(): Promise<number> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('bar_messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('is_read', false);
  return count ?? 0;
}

// ── Read state ────────────────────────────────────────────────────────────────

export async function markMessageRead(id: string): Promise<void> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  await supabase
    .from('bar_messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', org.id);
}

export async function markAllMessagesRead(): Promise<void> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  await supabase
    .from('bar_messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('organization_id', org.id)
    .eq('is_read', false);
}

export async function deleteMessage(id: string): Promise<void> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  await supabase.from('bar_messages').delete().eq('id', id).eq('organization_id', org.id);
}

// ── Approve / Deny order replies ──────────────────────────────────────────────

export async function approveOrderReply(messageId: string): Promise<void> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data: msg } = await supabase
    .from('bar_messages')
    .select('related_order_id')
    .eq('id', messageId)
    .eq('organization_id', org.id)
    .single();

  if (msg?.related_order_id) {
    await supabase
      .from('rep_orders')
      .update({ status: 'confirmed' })
      .eq('id', msg.related_order_id)
      .eq('organization_id', org.id);
  }

  await supabase
    .from('bar_messages')
    .update({ message_status: 'approved', is_read: true })
    .eq('id', messageId)
    .eq('organization_id', org.id);

  revalidatePath('/app/reps');
}

export async function denyOrderReply(messageId: string): Promise<void> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data: msg } = await supabase
    .from('bar_messages')
    .select('related_order_id')
    .eq('id', messageId)
    .eq('organization_id', org.id)
    .single();

  if (msg?.related_order_id) {
    await supabase
      .from('rep_orders')
      .update({ status: 'cancelled' })
      .eq('id', msg.related_order_id)
      .eq('organization_id', org.id);
  }

  await supabase
    .from('bar_messages')
    .update({ message_status: 'denied', is_read: true })
    .eq('id', messageId)
    .eq('organization_id', org.id);

  revalidatePath('/app/reps');
}
