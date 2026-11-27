/** What a bar without an active subscription may still open. Only an owner can export or close, so only an owner passes. */
export function blockedAccess(pathAndQuery: string, role: string): 'pass' | 'paywall' {
  if (role !== 'owner') return 'paywall';
  const [path, query = ''] = pathAndQuery.split('?');
  if (path.replace(/\/$/, '') !== '/app/settings') return 'paywall';
  const tab = new URLSearchParams(query).get('tab');
  return tab === 'data' || tab === 'billing' ? 'pass' : 'paywall';
}
