type RateLimitEntry = { count: number; resetAt: number };

const stores = new Map<string, Map<string, RateLimitEntry>>();

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  if (!stores.has(opts.key)) {
    stores.set(opts.key, new Map());
  }
  const store = stores.get(opts.key)!;

  return {
    check(identifier: string): { success: boolean; remaining: number } {
      const now = Date.now();
      const entry = store.get(identifier);

      if (!entry || now > entry.resetAt) {
        store.set(identifier, { count: 1, resetAt: now + opts.windowMs });
        return { success: true, remaining: opts.limit - 1 };
      }

      if (entry.count >= opts.limit) {
        return { success: false, remaining: 0 };
      }

      entry.count++;
      return { success: true, remaining: opts.limit - entry.count };
    },
  };
}

// Periodic cleanup of expired entries
if (typeof globalThis !== "undefined") {
  const CLEANUP_INTERVAL = 60_000;
  setInterval(() => {
    const now = Date.now();
    for (const store of stores.values()) {
      for (const [key, entry] of store) {
        if (now > entry.resetAt) store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL).unref?.();
}
