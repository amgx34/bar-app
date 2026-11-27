import { describe, it, expect } from 'vitest';
import { isActiveItem, isBelowPar } from './par';

describe('isActiveItem', () => {
  it('keeps NULL-active items, as the dashboard does, and drops only explicit false', () => {
    const items = [
      { is_active: null, current_stock: 1, par_level: 5 },
      { is_active: true, current_stock: 1, par_level: 5 },
      { is_active: false, current_stock: 1, par_level: 5 },
    ];
    expect(items.filter(isActiveItem).filter(isBelowPar)).toHaveLength(2);
  });
});
