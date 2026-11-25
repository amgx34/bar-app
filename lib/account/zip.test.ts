import { describe, it, expect } from 'vitest';
import { zipStore } from './zip';
import { toCsv } from './csv';

describe('zipStore', () => {
  it('writes a readable archive: signature, entry count, names, end record', () => {
    const z = zipStore([{ name: 'a.csv', data: 'x,y\n1,2\n' }, { name: 'b.csv', data: 'é\n' }]);
    expect(z.readUInt32LE(0)).toBe(0x04034b50);
    const eocd = z.length - 22;
    expect(z.readUInt32LE(eocd)).toBe(0x06054b50);
    expect(z.readUInt16LE(eocd + 10)).toBe(2);
    expect(z.toString('latin1')).toContain('a.csv');
    expect(z.toString('latin1')).toContain('b.csv');
  });
  it('is valid for an empty file list', () => {
    expect(zipStore([]).length).toBe(22);
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines, and unions columns', () => {
    const c = toCsv([{ a: 'x,y', b: 'say "hi"' }, { a: 1, c: 'l1\nl2' }]);
    expect(c.split('\n')[0]).toBe('a,b,c');
    expect(c).toContain('"x,y","say ""hi"""');
    expect(c).toContain('"l1\nl2"');
  });
  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    expect(toCsv([{ a: '=SUM(A1)', b: -5, c: '@x' }])).toContain("'=SUM(A1),-5,'@x");
  });
  it('serialises objects as JSON and null as empty', () => {
    expect(toCsv([{ a: { k: 1 }, b: null }])).toContain('"{""k"":1}",');
  });
  it('is empty-safe', () => {
    expect(toCsv([])).toBe('');
  });
});
