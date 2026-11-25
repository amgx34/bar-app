import { describe, it, expect } from 'vitest';
import { win32 } from 'node:path';
import { upperDriveLetter } from './drive-letter.mjs';

// win32.sep is a backslash. Using it keeps escape sequences out of the source.
const S = win32.sep;

describe('upperDriveLetter', () => {
  it('upper-cases a lowercase Windows drive letter', () => {
    expect(upperDriveLetter(`c:${S}Users${S}notug${S}bar-app`)).toBe(`C:${S}Users${S}notug${S}bar-app`);
  });
  it('handles forward slashes', () => {
    expect(upperDriveLetter('d:/work/app')).toBe('D:/work/app');
  });
  it('leaves an already upper-case drive letter alone', () => {
    expect(upperDriveLetter(`C:${S}x`)).toBe(`C:${S}x`);
  });
  it('leaves POSIX paths alone', () => {
    expect(upperDriveLetter('/c/Users/x')).toBe('/c/Users/x');
  });
  it('does not touch a colon that is not a drive letter', () => {
    expect(upperDriveLetter(`ab:${S}x`)).toBe(`ab:${S}x`);
  });
});
