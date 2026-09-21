/**
 * plan mobile_load D11: the service worker, tested by RUNNING the exact script `/sw.js`
 * serves, in a `vm` sandbox with fake `caches`, `fetch` and `clients`.
 *
 * The invariant that matters most: it must never answer a navigation, an API call, an RSC
 * request or anything cross-origin. The HTML is auth-gated by `proxy.ts`; a worker that
 * cached it would hand a signed-out visitor the app shell.
 */
import vm from 'node:vm';
import { describe, it, expect, beforeEach } from 'vitest';
import { IMMUTABLE_ASSET_PREFIXES, LONG_LIVED_ASSET_PREFIXES, headshotThumb } from '@/lib/headshotThumb';
import { ASSET_CACHE, buildServiceWorkerSource } from '@/lib/serviceWorker';

const ORIGIN = 'https://hoops-draft.vercel.app';

class FakeCache {
  entries = new Map<string, Response>();
  async match(request: Request) { return this.entries.get(request.url)?.clone(); }
  async put(request: Request, response: Response) { this.entries.set(request.url, response); }
  async delete(request: Request) { return this.entries.delete(request.url); }
  async keys() { return [...this.entries.keys()].map((url) => new Request(url)); }
}

type Listener = (event: Record<string, unknown>) => void;

function boot(options: { buildId?: string; disabled?: boolean; cardSetVersion?: string } = {}) {
  const stores = new Map<string, FakeCache>();
  const listeners = new Map<string, Listener>();
  const fetched: string[] = [];
  let respond: (url: string) => Response | Promise<Response> = () => new Response('body', { status: 200 });
  const state = { unregistered: false, claimed: false, skippedWaiting: false };

  const sandbox = {
    URL, Request, Response,
    caches: {
      open: async (name: string) => { if (!stores.has(name)) stores.set(name, new FakeCache()); return stores.get(name)!; },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
    fetch: async (request: Request) => {
      fetched.push(request.url);
      const response = await respond(request.url);
      // A real same-origin response is `basic`; `new Response()` in Node says 'default'.
      Object.defineProperty(response, 'type', { value: 'basic' });
      return response;
    },
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
      skipWaiting: () => { state.skippedWaiting = true; },
      clients: { claim: async () => { state.claimed = true; } },
      registration: { unregister: async () => { state.unregistered = true; } },
    },
  };
  vm.runInNewContext(buildServiceWorkerSource({
    buildId: options.buildId ?? 'build-2',
    cardSetVersion: options.cardSetVersion ?? '2025-26.2',
    immutablePrefixes: IMMUTABLE_ASSET_PREFIXES,
    longLivedPrefixes: LONG_LIVED_ASSET_PREFIXES,
    disabled: options.disabled,
  }), sandbox);

  /** Dispatches a fetch event; resolves to the worker's response, or null when it declined. */
  const request = async (url: string, init: { method?: string; mode?: string } = {}) => {
    const req = new Request(url.startsWith('http') ? url : ORIGIN + url, { method: init.method ?? 'GET' });
    Object.defineProperty(req, 'mode', { value: init.mode ?? 'no-cors' });
    let answer: Promise<Response> | null = null;
    const pending: Promise<unknown>[] = [];
    listeners.get('fetch')!({
      request: req,
      respondWith: (p: Promise<Response>) => { answer = p; },
      waitUntil: (p: Promise<unknown>) => { pending.push(p); },
    });
    const response = answer ? await (answer as Promise<Response>) : null;
    await Promise.all(pending);
    return response;
  };
  const activate = async () => {
    const pending: Promise<unknown>[] = [];
    listeners.get('activate')!({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  };
  return { stores, fetched, state, request, activate, listeners, setRespond: (fn: typeof respond) => { respond = fn; } };
}

describe('service worker: what it refuses to touch', () => {
  let sw: ReturnType<typeof boot>;
  beforeEach(() => { sw = boot(); });

  it('never answers a navigation, even to a cacheable-looking path', async () => {
    expect(await sw.request('/', { mode: 'navigate' })).toBeNull();
    expect(await sw.request('/rosters', { mode: 'navigate' })).toBeNull();
    expect(await sw.request('/art/arena-1600.webp', { mode: 'navigate' })).toBeNull();
  });

  it('never answers app routes, RSC payloads, API calls, the optimizer or its own script', async () => {
    for (const path of ['/rosters?_rsc=abc', '/api/auth/me', '/api/analytics', '/_next/image?url=%2Fart%2Fx.webp&w=640&q=75',
      '/manifest.webmanifest', '/sw.js', '/login', '/headshots/1629029.png']) {
      expect(await sw.request(path), path).toBeNull();
    }
    expect(sw.fetched).toEqual([]);
  });

  it('never answers a non-GET or a cross-origin request', async () => {
    expect(await sw.request('/_next/static/chunks/a.js', { method: 'POST' })).toBeNull();
    expect(await sw.request('https://xyz.supabase.co/rest/v1/rpc/cas_upsert')).toBeNull();
    expect(await sw.request('https://evil.example/_next/static/chunks/a.js')).toBeNull();
  });
});

describe('service worker: caching', () => {
  it('serves build output cache-first from the per-build cache', async () => {
    const sw = boot({ buildId: 'abc123' });
    expect(await (await sw.request('/_next/static/chunks/a.js'))!.text()).toBe('body');
    expect(await (await sw.request('/_next/static/chunks/a.js'))!.text()).toBe('body');
    expect(sw.fetched).toHaveLength(1);
    expect([...sw.stores.keys()]).toEqual(['mb-static-abc123']);
  });

  it('serves every immutable prefix cache-first from the asset cache, keyed with its version', async () => {
    const sw = boot();
    const urls = [headshotThumb('1629029', 96), headshotThumb('1629029', 480), '/art/cardback.webp'];
    for (const url of urls) { await sw.request(url); await sw.request(url); }
    expect(sw.fetched).toHaveLength(urls.length);
    expect([...sw.stores.get(ASSET_CACHE)!.entries.keys()]).toEqual(urls.map((u) => ORIGIN + u));
  });

  it('never stores an error, a partial or an opaque response', async () => {
    const sw = boot();
    sw.setRespond(() => new Response('<html>deploy in progress</html>', { status: 404 }));
    expect((await sw.request('/_next/static/chunks/gone.js'))!.status).toBe(404);
    sw.setRespond(() => new Response('part', { status: 206 }));
    await sw.request('/art/arena-1600.webp');
    expect(sw.stores.get('mb-static-build-2')!.entries.size).toBe(0);
    expect(sw.stores.get(ASSET_CACHE)!.entries.size).toBe(0);
  });

  it('serves unversioned logos and icons stale-while-revalidate', async () => {
    const sw = boot();
    sw.setRespond(() => new Response('old logo'));
    expect(await (await sw.request('/logos/1610612737.svg'))!.text()).toBe('old logo');
    sw.setRespond(() => new Response('new logo'));
    expect(await (await sw.request('/logos/1610612737.svg'))!.text()).toBe('old logo'); // instant, from cache
    expect(await (await sw.request('/logos/1610612737.svg'))!.text()).toBe('new logo'); // refreshed behind it
  });

  it('keeps answering a cached logo when the refresh fails (offline)', async () => {
    const sw = boot();
    await sw.request('/icons/icon-192.png');
    sw.setRespond(() => { throw new TypeError('Failed to fetch'); });
    expect(await (await sw.request('/icons/icon-192.png'))!.text()).toBe('body');
  });

  it('covers every prefix the cache headers cover, and nothing else', () => {
    const source = buildServiceWorkerSource({ buildId: 'x', cardSetVersion: 'v', immutablePrefixes: IMMUTABLE_ASSET_PREFIXES, longLivedPrefixes: LONG_LIVED_ASSET_PREFIXES });
    const config = JSON.parse(source.slice(source.indexOf('{'), source.indexOf('};') + 1));
    expect(config.immutable).toEqual([...IMMUTABLE_ASSET_PREFIXES]);
    expect(config.longLived).toEqual([...LONG_LIVED_ASSET_PREFIXES]);
  });
});

describe('service worker: lifecycle', () => {
  it('on activate drops older build caches and headshots of an older card set, keeps the rest', async () => {
    const old = boot({ buildId: 'build-1', cardSetVersion: '2025-26.1' });
    await old.request('/_next/static/chunks/a.js');
    await old.request('/headshots/96/1629029.webp?v=2025-26.1');
    await old.request('/art/cardback.webp');

    // Same browser storage, next deploy with a new card set.
    const next = boot({ buildId: 'build-2', cardSetVersion: '2025-26.2' });
    for (const [name, cache] of old.stores) next.stores.set(name, cache);
    await next.request('/_next/static/chunks/b.js');
    await next.activate();

    expect([...next.stores.keys()].sort()).toEqual([ASSET_CACHE, 'mb-static-build-2']);
    expect([...next.stores.get(ASSET_CACHE)!.entries.keys()]).toEqual([`${ORIGIN}/art/cardback.webp`]);
    expect(next.state.claimed).toBe(true);
  });

  it('takes over immediately on install', () => {
    const sw = boot();
    sw.listeners.get('install')!({});
    expect(sw.state.skippedWaiting).toBe(true);
  });

  it('the disabled build removes its caches and unregisters, and handles no fetch', async () => {
    const live = boot();
    await live.request('/art/cardback.webp');
    const killed = boot({ disabled: true });
    for (const [name, cache] of live.stores) killed.stores.set(name, cache);
    killed.stores.set('someone-elses-cache', new FakeCache());

    expect(killed.listeners.has('fetch')).toBe(false);
    await killed.activate();
    expect([...killed.stores.keys()]).toEqual(['someone-elses-cache']);
    expect(killed.state.unregistered).toBe(true);
  });
});
