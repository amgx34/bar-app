'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { isValidTimeZone } from '@/lib/pos/business-date';
import { saveCredentials } from '@/lib/pos/credentials';
import { applyToastConnection, type PosConfig } from '@/lib/pos/pos-config';
import { loginToast } from '@/lib/pos/providers/toast/auth';
import { NeedsReauthError } from '@/lib/pos/providers/types';
import { createToastClient, ToastHttpError, toastHost } from '@/lib/toast/client';

export type ConnectToastResult =
  | { ok: true; restaurant: string; timezone: string }
  | { ok: false; error: string };

const GUID = /^[0-9a-fA-F][0-9a-fA-F-]{6,62}$/;

/**
 * Verifies Toast API credentials against the restaurant, then stores them.
 *
 * Verified means a real login AND a read of this restaurant, so a wrong GUID or
 * a credential for a different location fails here, not on the first night.
 * Owner only: a Toast API credential is a standing read grant on the whole
 * restaurant.
 *
 * Errors are RETURNED, not thrown: a thrown message is replaced by a generic
 * one in production, and the owner needs to know which of the three fixes to
 * make. Nothing returned or logged contains the secret, and nothing is written
 * until Toast has answered.
 */
export async function connectToast(input: {
  client_id: string; client_secret: string; restaurant_guid: string;
}): Promise<ConnectToastResult> {
  const { org, role } = await getCurrentOrg();
  if (role !== 'owner') return { ok: false, error: 'Only the owner can connect Toast.' };

  const clientId = String(input.client_id ?? '').trim();
  const clientSecret = String(input.client_secret ?? '').trim();
  const guid = String(input.restaurant_guid ?? '').trim();
  if (!clientId || !clientSecret || !guid) return { ok: false, error: 'Client ID, client secret and restaurant GUID are all required.' };
  if (clientId.length > 200 || clientSecret.length > 500) return { ok: false, error: 'The client ID or secret looks too long. Check what you pasted.' };
  if (!GUID.test(guid)) return { ok: false, error: 'The restaurant GUID should look like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.' };

  let login;
  try {
    login = await loginToast(clientId, clientSecret);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof NeedsReauthError
        ? 'Toast rejected that client ID and secret. Check both were copied exactly, and that Toast API access is switched on for this restaurant.'
        : e instanceof Error ? e.message : 'Could not reach Toast.',
    };
  }

  let restaurant;
  try {
    restaurant = await createToastClient({ host: toastHost(), restaurantGuid: guid, getToken: async () => login.accessToken }).restaurant(guid);
  } catch (e) {
    const s = e instanceof ToastHttpError ? e.status : 0;
    return {
      ok: false,
      error: s === 404 ? 'Toast has no restaurant with that GUID. Copy the restaurant GUID for this location.'
        : s === 401 || s === 403 ? 'Those credentials work, but they cannot read this restaurant. They need the restaurant details permission and must be issued for this location.'
        : e instanceof Error ? e.message : 'Could not read the restaurant from Toast.',
    };
  }

  // Toast, not Rail, says when the business day rolls over and where it is. Guessing either shifts every night.
  const tz = restaurant.general?.timeZone;
  const closeout = restaurant.general?.closeoutHour;
  if (!isValidTimeZone(tz) || typeof closeout !== 'number' || !Number.isFinite(closeout) || closeout < 0 || closeout > 23) {
    return { ok: false, error: 'Toast did not report this restaurant’s time zone or closeout hour, so Rail cannot tell which night a sale belongs to. Nothing was saved.' };
  }

  const admin = createAdminClient();
  try {
    await saveCredentials(admin, org.id, {
      provider: 'toast', externalId: guid,
      secrets: { client_id: clientId, client_secret: clientSecret, access_token: login.accessToken, token_expires_at: login.expiresAt },
    });

    // Build from the config as it stands NOW: saveCredentials may just have written credentials_enc into it.
    const { data } = await admin.from('organizations').select('pos_config').eq('id', org.id).single();
    const next = applyToastConnection((data?.pos_config ?? {}) as PosConfig, {
      restaurant_guid: guid,
      toast_restaurant_name: restaurant.general?.locationName?.trim() || restaurant.general?.name?.trim() || null,
      timezone: tz,
      toast_closeout_hour: Math.trunc(closeout),
      needs_reauth: false,
    });
    const { error } = await admin.from('organizations').update({ pos_provider: 'toast', pos_config: next }).eq('id', org.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error(`[toast] org=${org.id} could not save the connection:`, e instanceof Error ? e.message : e);
    return { ok: false, error: 'Toast accepted the credentials but Rail could not save them. Try again.' };
  }

  revalidatePath('/app/settings');
  revalidatePath('/app/dashboard');
  return { ok: true, restaurant: restaurant.general?.locationName?.trim() || restaurant.general?.name?.trim() || 'your restaurant', timezone: tz };
}
