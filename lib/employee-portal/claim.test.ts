import { describe, it, expect } from 'vitest';
import { normaliseName, matchEmployeeName } from './claim';

const roster = [
  { id: 'a', name: 'Dana Whitfield' },
  { id: 'b', name: 'Dave Ramos' },
  { id: 'c', name: 'Dave Ramos' },
];

describe('normaliseName', () => {
  it('ignores case, surrounding space and doubled spaces', () => {
    expect(normaliseName('  Dana   WHITFIELD ')).toBe('dana whitfield');
  });
});

describe('matchEmployeeName', () => {
  it('matches one employee by normalised name', () => {
    expect(matchEmployeeName('  dana whitfield ', roster))
      .toEqual({ kind: 'one', employeeId: 'a' });
  });

  it('reports no match rather than guessing at a partial one', () => {
    // "Dana" is not Dana Whitfield. A prefix match here would let someone
    // claim a colleague by typing a common first name.
    expect(matchEmployeeName('Dana', roster)).toEqual({ kind: 'none' });
  });

  it('reports ambiguity when two employees share a name', () => {
    expect(matchEmployeeName('Dave Ramos', roster)).toEqual({ kind: 'ambiguous' });
  });

  it('treats an empty typed name as no match', () => {
    expect(matchEmployeeName('   ', roster)).toEqual({ kind: 'none' });
  });
});
