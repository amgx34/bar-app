/** Staff only ever live under /me (and arrive through /join); /app is not theirs. */
export function errorHome(pathname: string) {
  return /^\/(me|join)(\/|$)/.test(pathname)
    ? { href: '/me', label: 'Back to my page' }
    : { href: '/app/dashboard', label: 'Back to dashboard' };
}
