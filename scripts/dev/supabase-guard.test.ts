import { describe, it, expect } from 'vitest';
import { assertSupabaseAllowed, projectRefFromUrl } from './supabase-guard';

const live = 'abcdlive';
const dev = 'abcddev';
const run = (args: string[], over: Partial<Parameters<typeof assertSupabaseAllowed>[0]> = {}) =>
  assertSupabaseAllowed({ args, targetRef: dev, liveRef: live, allowLive: false, ...over });

describe('projectRefFromUrl', () => {
  it('reads the ref, ignoring case and a trailing slash', () => {
    expect(projectRefFromUrl('https://AbcdLive.supabase.co/')).toBe('abcdlive');
  });
  it('returns empty for blank or non-Supabase URLs', () => {
    expect(projectRefFromUrl('')).toBe('');
    expect(projectRefFromUrl(undefined)).toBe('');
    expect(projectRefFromUrl('http://localhost:54321')).toBe('');
  });
});

describe('assertSupabaseAllowed', () => {
  it('allows db push on the dev ref', () => {
    expect(() => run(['db', 'push'])).not.toThrow();
  });
  it('refuses db push on the live ref, naming command and ref', () => {
    expect(() => run(['db', 'push'], { targetRef: live })).toThrow(/db push[\s\S]*abcdlive/);
  });
  it('refuses link, db reset, migration up and --linked on live', () => {
    for (const args of [['link'], ['db', 'reset'], ['migration', 'up'], ['db', 'pull'], ['gen', 'types', '--linked']]) {
      expect(() => run(args, { targetRef: live })).toThrow();
    }
  });
  it('refuses link --project-ref <live> even when the env target is dev', () => {
    expect(() => run(['link', '--project-ref', live])).toThrow();
    expect(() => run(['link', '--project-ref', 'abcdother'])).not.toThrow();
  });
  it('refuses a --db-url that contains the live ref without printing it', () => {
    const url = 'postgresql://postgres:s3cret@db.abcdlive.supabase.co:5432/postgres';
    try {
      run(['db', 'push', '--db-url', url]);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain(live);
      expect((e as Error).message).not.toContain('s3cret');
    }
  });
  it('fails closed when the target or live ref is unknown', () => {
    expect(() => run(['db', 'push'], { targetRef: '' })).toThrow();
    expect(() => run(['db', 'push'], { liveRef: '' })).toThrow();
  });
  it('allows read-only commands for any target, including live and unknown', () => {
    for (const args of [['--version'], ['migration', 'list'], ['db', 'diff', '--dry-run'], ['db', 'push', '--dry-run']]) {
      expect(() => run(args, { targetRef: live })).not.toThrow();
      expect(() => run(args, { targetRef: '', liveRef: '' })).not.toThrow();
    }
  });
  it('allows --local', () => {
    expect(() => run(['db', 'reset', '--local'], { targetRef: '', liveRef: '' })).not.toThrow();
  });
  describe('linked project (supabase/.temp/project-ref)', () => {
    it('refuses a plain db push when the CLI is linked to live, even with env dev', () => {
      expect(() => run(['db', 'push'], { linkedRef: live })).toThrow(/LIVE/);
    });
    it('allows linked dev with env dev', () => {
      expect(() => run(['db', 'push'], { linkedRef: dev })).not.toThrow();
    });
    it('refuses linked dev when env points at live, naming both refs', () => {
      expect(() => run(['db', 'push'], { linkedRef: dev, targetRef: live })).toThrow(/abcddev[\s\S]*abcdlive|abcdlive[\s\S]*abcddev/);
    });
    it('refuses a linked ref that differs from the env target', () => {
      expect(() => run(['db', 'push'], { linkedRef: 'abcdother' })).toThrow(/abcdother[\s\S]*abcddev|abcddev[\s\S]*abcdother/);
    });
    it('falls back to the env target when nothing is linked', () => {
      expect(() => run(['db', 'push'], { linkedRef: '' })).not.toThrow();
      expect(() => run(['db', 'push'], { linkedRef: '', targetRef: live })).toThrow(/LIVE/);
    });
    it('lets an explicit --project-ref win over the linked file', () => {
      expect(() => run(['link', '--project-ref', 'abcdother'], { linkedRef: live })).not.toThrow();
      expect(() => run(['link', '--project-ref', live], { linkedRef: dev })).toThrow(/LIVE/);
    });
    it('still allows read-only commands when linked to live', () => {
      for (const args of [['migration', 'list'], ['db', 'push', '--dry-run']]) {
        expect(() => run(args, { linkedRef: live })).not.toThrow();
      }
    });
  });
  it('lets live through when allowLive is set', () => {
    expect(() => run(['db', 'push'], { targetRef: live, allowLive: true })).not.toThrow();
  });
});
