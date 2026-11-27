import { describe, expect, it } from 'vitest';
import { errorHome } from './error-home';

describe('where an error screen sends someone', () => {
  it('keeps staff in the staff portal', () => {
    for (const p of ['/me', '/me/pending', '/join'])
      expect(errorHome(p)).toEqual({ href: '/me', label: 'Back to my page' });
  });
  it('sends everyone else to the dashboard', () => {
    for (const p of ['/app/sales', '/menu', '/', ''])
      expect(errorHome(p)).toEqual({ href: '/app/dashboard', label: 'Back to dashboard' });
  });
});
