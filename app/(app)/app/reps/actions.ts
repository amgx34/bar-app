'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { canManageReps } from '@/lib/permissions';
import { repSchema, orderSchema, type RepInput, type OrderInput } from '@/lib/schemas/reps';
import { sendEmail, buildOrderEmail, buildConfirmationEmail } from '@/lib/reps/email';
import { sendOrderSms } from '@/lib/reps/sms';

// ── Public types ──────────────────────────────────────────────────────────────

export type Rep = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  product_count: number;
};

export type RepOrder = {
  id: string;
  rep_id: string;
  po_number: string | null;
  delivery_date: string | null;
  notes: string | null;
  status: string;
  send_email: boolean;
  send_sms: boolean;
  items: unknown[];
  created_at: string;
};

export type RepInventoryItem = {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  par_level: number | null;
  sku: string | null;
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createRep(raw: unknown): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManageReps(role)) throw new Error('Not authorized');

  const input = repSchema.parse(raw);
  const admin = createAdminClient();
  const { error } = await admin.from('reps').insert({
    organization_id: org.id,
    name:    input.name,
    company: input.company  || null,
    phone:   input.phone    || null,
    email:   input.email    || null,
    notes:   input.notes    || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/app/reps');
}

export async function updateRep(repId: string, raw: unknown): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManageReps(role)) throw new Error('Not authorized');

  const input = repSchema.parse(raw);
  const admin = createAdminClient();
  const { error } = await admin
    .from('reps')
    .update({
      name:    input.name,
      company: input.company || null,
      phone:   input.phone   || null,
      email:   input.email   || null,
      notes:   input.notes   || null,
    })
    .eq('id', repId)
    .eq('organization_id', org.id);
  if (error) throw new Error(error.message);
  revalidatePath('/app/reps');
}

export async function deleteRep(repId: string): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManageReps(role)) throw new Error('Not authorized');

  const admin = createAdminClient();
  // Unlink inventory items first
  await admin.from('inventory_items').update({ rep_id: null }).eq('rep_id', repId).eq('organization_id', org.id);
  // Soft delete
  const { error } = await admin.from('reps').update({ is_active: false }).eq('id', repId).eq('organization_id', org.id);
  if (error) throw new Error(error.message);
  revalidatePath('/app/reps');
  revalidatePath('/app/inventory');
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function sendRepOrder(repId: string, raw: unknown): Promise<{ orderId: string; emailWarning?: string }> {
  const { org, role } = await getCurrentOrg();
  if (!canManageReps(role)) throw new Error('Not authorized');

  const input = orderSchema.parse(raw);
  const admin = createAdminClient();

  // Fetch rep
  const { data: rep } = await admin
    .from('reps')
    .select('name, company, email, phone')
    .eq('id', repId)
    .eq('organization_id', org.id)
    .single();
  if (!rep) throw new Error('Rep not found');

  // Validate send method vs available contacts
  if (input.send_email && !rep.email) throw new Error(`${rep.name} has no email address on file.`);
  if (input.send_sms   && !rep.phone) throw new Error(`${rep.name} has no phone number on file.`);

  const poNumber    = input.po_number     || `RO-${Date.now().toString(36).toUpperCase()}`;
  const deliveryFmt = input.delivery_date ? new Date(input.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  // ── 1. Save order to DB first — always succeeds regardless of email/SMS ──────
  const { data: order, error: orderErr } = await admin
    .from('rep_orders')
    .insert({
      organization_id: org.id,
      rep_id:          repId,
      po_number:       poNumber,
      delivery_date:   input.delivery_date || null,
      notes:           input.notes || null,
      status:          'sent',
      send_email:      input.send_email,
      send_sms:        input.send_sms,
      items:           input.items,
    })
    .select('id')
    .single();
  if (orderErr || !order) throw new Error(orderErr?.message ?? 'Failed to record order');

  // ── 2. Send notifications (best-effort — never block or lose the order) ──────
  const emailErrors: string[] = [];

  if (input.send_email && rep.email) {
    const html = buildOrderEmail({
      orgName:      org.name,
      repName:      rep.name,
      repEmail:     rep.email,
      poNumber,
      deliveryDate: deliveryFmt,
      notes:        input.notes || '',
      items:        input.items,
    });
    try {
      await sendEmail(rep.email, `Order from ${org.name} — PO ${poNumber}`, html);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emailErrors.push(`Email to rep failed: ${msg}`);
      console.error('[sendRepOrder] email to rep failed:', msg);
    }
  }

  if (input.send_sms && rep.phone) {
    const itemList = input.items.map((i) => `${i.name} ×${i.quantity}`).join(', ');
    const msg = `${org.name} Order — PO: ${poNumber}${deliveryFmt ? ` | Deliver by: ${deliveryFmt}` : ''} | ${itemList}${input.notes ? ` | Note: ${input.notes}` : ''}`;
    try {
      await sendOrderSms(rep.phone, msg);
    } catch (err) {
      console.error('[sendRepOrder] SMS to rep failed:', err);
    }
  }

  // Confirmation email to org owner (always best-effort)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email) {
    const html = buildConfirmationEmail({
      orgName:    org.name,
      repName:    rep.name,
      repCompany: rep.company ?? '',
      poNumber,
      itemCount:  input.items.length,
    });
    sendEmail(user.email, `Order sent to ${rep.name} — ${org.name}`, html).catch(() => {});
  }

  revalidatePath('/app/reps');

  // Return the order ID plus any non-fatal email warnings so the UI can surface them
  return {
    orderId:      order.id,
    emailWarning: emailErrors.length > 0 ? emailErrors[0] : undefined,
  };
}

export async function getRepOrders(repId: string): Promise<RepOrder[]> {
  const { org } = await getCurrentOrg();
  const admin = createAdminClient();
  const { data } = await admin
    .from('rep_orders')
    .select('id,rep_id,po_number,delivery_date,notes,status,send_email,send_sms,items,created_at')
    .eq('organization_id', org.id)
    .eq('rep_id', repId)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as RepOrder[];
}

export async function getRepInventoryItems(repId: string): Promise<RepInventoryItem[]> {
  const { org } = await getCurrentOrg();
  const admin = createAdminClient();
  const { data } = await admin
    .from('inventory_items')
    .select('id, name, unit, current_stock, par_level, sku')
    .eq('organization_id', org.id)
    .eq('rep_id', repId)
    .eq('is_active', true)
    .order('name');
  return (data ?? []) as RepInventoryItem[];
}
