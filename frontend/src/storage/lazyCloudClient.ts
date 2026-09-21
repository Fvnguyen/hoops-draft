/**
 * A `CloudSyncClient` that does not load supabase-js until the first cloud call
 * (plan mobile_load D7).
 *
 * `getGameStore()` is synchronous and is called from the root layout, so constructing the
 * real Supabase client there put the whole library (~100 KB gzipped) into the JavaScript
 * of every route — including `/login`, where nobody is signed in and no cloud call can
 * happen. `SupabaseGameStore` only ever talks to the cloud once an owner is set, so the
 * client can be a thin shell that imports the library on first use. Every method already
 * returns a promise (or a thenable), which is what makes this transparent to the store.
 */

import type { CloudSelectResult, CloudSyncClient } from './supabase';

export function createLazyCloudClient(load: () => Promise<CloudSyncClient>): CloudSyncClient {
  let loading: Promise<CloudSyncClient> | null = null;
  // One import, shared by every caller. A failed load (offline, a chunk 404 after a
  // deploy) must not be cached, or sync would stay dead until the app restarts.
  const client = (): Promise<CloudSyncClient> => {
    if (!loading) {
      loading = load().catch((error) => {
        loading = null;
        throw error;
      });
    }
    return loading;
  };

  const lazy = {
    rpc: (fn: 'cas_upsert' | 'cas_delete', args: never) =>
      client().then((real) => (real.rpc as (f: string, a: unknown) => Promise<unknown>)(fn, args)),
    from: (table: Parameters<CloudSyncClient['from']>[0]) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => {
          // Build the query INSIDE the promise callback. A Postgrest builder is itself a
          // thenable, so returning one from `.then()` executes it on the spot: handing it
          // on to a later `.in()` would run the unfiltered query and then fail.
          const build = (real: CloudSyncClient) => real.from(table).select(columns).eq(column, value);
          return {
            then: <A, B>(
              onFulfilled?: ((value: CloudSelectResult) => A | PromiseLike<A>) | null,
              onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
            ) => client().then((real) => build(real)).then(onFulfilled, onRejected),
            in: (inColumn: string, values: string[]) => ({
              then: <A, B>(
                onFulfilled?: ((value: CloudSelectResult) => A | PromiseLike<A>) | null,
                onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
              ) => client().then((real) => build(real).in(inColumn, values)).then(onFulfilled, onRejected),
            }),
          };
        },
      }),
    }),
  };
  return lazy as unknown as CloudSyncClient;
}
