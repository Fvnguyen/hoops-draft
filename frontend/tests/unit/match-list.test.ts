/**
 * The shared match list behind `useMatchList` (bell + `/playoffs/new`): callers that load
 * together make ONE `match_expire` + ONE select, a fresh list is reused, `force` reloads,
 * and an account switch never shows the previous user's rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const order = vi.fn();
const client = {
  rpc: (...args: unknown[]) => rpc(...args),
  from: () => ({ select: () => ({ or: () => ({ order: (...args: unknown[]) => order(...args) }) }) }),
};

vi.mock('@/lib/matchChannel', () => ({
  loadMatchClient: () => Promise.resolve(client),
  openMatchChannel: vi.fn(),
  sendMatchAction: vi.fn(),
}));
vi.mock('@/components/AuthProvider', () => ({ useCurrentProfile: () => null }));

const { fetchMatchList, resetMatchListForTests } = await import('@/hooks/useMatch');

describe('shared match list', () => {
  beforeEach(() => {
    resetMatchListForTests();
    rpc.mockReset().mockResolvedValue({ data: 0, error: null });
    order.mockReset().mockResolvedValue({ data: [{ id: 'match_1' }], error: null });
  });

  it('three callers mounting together make one expire call and one select', async () => {
    await Promise.all([fetchMatchList('u1'), fetchMatchList('u1'), fetchMatchList('u1')]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(order).toHaveBeenCalledTimes(1);
  });

  it('reuses a list younger than 2 s, reloads an older one', async () => {
    let t = 1_000;
    const now = () => t;
    await fetchMatchList('u1', false, now);
    t += 1_500;
    await fetchMatchList('u1', false, now);
    expect(order).toHaveBeenCalledTimes(1);
    t += 1_000;
    await fetchMatchList('u1', false, now);
    expect(order).toHaveBeenCalledTimes(2);
  });

  it('force waits for the in-flight load and then loads again', async () => {
    await Promise.all([fetchMatchList('u1'), fetchMatchList('u1', true)]);
    expect(order).toHaveBeenCalledTimes(2);
  });

  it("an account switch loads the new user's list instead of reusing the old one", async () => {
    await fetchMatchList('u1');
    await fetchMatchList('u2');
    expect(order).toHaveBeenCalledTimes(2);
  });

  it('a failed load resolves with an empty list and does not throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(fetchMatchList('u1')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
