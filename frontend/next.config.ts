import type { NextConfig } from "next";
import path from "path";
import { buildCacheHeaderRules } from "./src/lib/cacheHeaders";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Everything still routed through the optimizer (card fronts stay `unoptimized` per
  // plan mobile_load D4, but e.g. `next/image` local imports still hit it) gets Next 16's
  // pre-15 default TTL back: 31 days instead of the new 4-hour default (see
  // node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md).
  images: { minimumCacheTTL: 2678400 },
  // plan mobile_load D5: long Cache-Control on the static art/headshot/icon/logo
  // directories `src/lib/headshotThumb.ts` names, built from that file's own prefix lists.
  async headers() {
    return buildCacheHeaderRules();
  },
};

export default nextConfig;
