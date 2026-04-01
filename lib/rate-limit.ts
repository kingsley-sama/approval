const requests = new Map<string, number[]>();

/**
 * Simple in-memory sliding window rate limiter.
 * Returns true if the request should be allowed, false if rate-limited.
 */
export function checkRateLimit(
  key: string,
  windowMs: number = 60_000,
  maxRequests: number = 10,
): boolean {
  const now = Date.now();
  const timestamps = requests.get(key) ?? [];

  // Remove timestamps outside the window
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    requests.set(key, recent);
    return false;
  }

  recent.push(now);
  requests.set(key, recent);
  return true;
}

// Periodically clean up stale entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requests) {
    const recent = timestamps.filter((t) => now - t < 120_000);
    if (recent.length === 0) {
      requests.delete(key);
    } else {
      requests.set(key, recent);
    }
  }
}, 60_000);
