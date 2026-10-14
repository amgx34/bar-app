import { describe, it, expect } from 'vitest';
import { parseAgentVersion, applyAgentVersion, applySyncOutcome } from './pos-config';

const NOW = '2026-10-13T22:00:00.000Z';

describe('parseAgentVersion', () => {
  it('reads the version out of the agent header', () => {
    expect(parseAgentVersion('rail-2touch-agent/1.4.0 (dotnet)')).toBe('1.4.0');
  });

  it('ignores a header from something else', () => {
    expect(parseAgentVersion('Mozilla/5.0')).toBeNull();
  });

  it('ignores a missing header', () => {
    expect(parseAgentVersion(null)).toBeNull();
  });

  it('keeps every component, so 1.10.0 is not read as 1.1', () => {
    expect(parseAgentVersion('rail-2touch-agent/1.10.0 (dotnet)')).toBe('1.10.0');
  });
});

describe('pos_config writers', () => {
  it('records a new agent version', () => {
    const next = applyAgentVersion({ agent_version: '1.2.0' }, '1.4.0', NOW);

    expect(next.agent_version).toBe('1.4.0');
    expect(next.agent_seen_at).toBe(NOW);
  });

  it('leaves unrelated keys alone', () => {
    const next = applyAgentVersion({ agent_token: 'secret', cutoff_hour: 4 }, '1.4.0', NOW);

    expect(next.agent_token).toBe('secret');
    expect(next.cutoff_hour).toBe(4);
  });

  /**
   * The bug this file exists for.
   *
   * pos_config is one JSON blob with two writers in a single ingest request.
   * Both used to spread the same object read at the top of the request, so the
   * sync outcome — written last — put a stale agent_version back over the one
   * just stored. A bar sat on 1.2.0 for a month with the 1.4.0 agent syncing
   * every five minutes, because each sync recorded the new version and then
   * immediately reverted it.
   */
  it('writing the sync outcome does not revert a version recorded earlier in the same request', () => {
    const read = { agent_version: '1.2.0', agent_token: 'secret' };

    const afterVersion = applyAgentVersion(read, '1.4.0', NOW);
    const afterOutcome = applySyncOutcome(afterVersion, [], null, NOW);

    expect(afterOutcome.agent_version).toBe('1.4.0');
  });

  it('writing the version does not drop a sync outcome recorded earlier', () => {
    const read = { agent_version: '1.2.0' };

    const afterOutcome = applySyncOutcome(read, ['boom'], null, NOW);
    const afterVersion = applyAgentVersion(afterOutcome, '1.4.0', NOW);

    expect(afterVersion.last_sync_errors).toEqual(['boom']);
    expect(afterVersion.last_sync_at).toBe(NOW);
  });

  it('truncates errors to five, each to 300 characters', () => {
    const next = applySyncOutcome({}, ['x'.repeat(400), 'b', 'c', 'd', 'e', 'f'], null, NOW);

    expect(next.last_sync_errors).toHaveLength(5);
    expect((next.last_sync_errors as string[])[0]).toHaveLength(300);
  });

  it('records an absent summary as null rather than leaving it off', () => {
    // sync-health reads a missing last_sync_summary as "cannot say", never as
    // "moved nothing", so the difference is load-bearing.
    const next = applySyncOutcome({}, [], null, NOW);

    expect(next.last_sync_summary).toBeNull();
  });
});
