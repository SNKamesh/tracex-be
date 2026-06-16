/**
 * Rate-limit-ready middleware structure.
 * Enable by setting RATE_LIMIT_ENABLED=true and optionally tuning window/max env vars.
 *
 * Env:
 *   RATE_LIMIT_ENABLED=true|false (default: false)
 *   RATE_LIMIT_WINDOW_MS=60000
 *   RATE_LIMIT_MAX=30
 */

const store = new Map();

function getClientKey(req) {
  return req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
}

function isEnabled() {
  return process.env.RATE_LIMIT_ENABLED === "true";
}

function getWindowMs() {
  const parsed = Number(process.env.RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

function getMaxRequests() {
  const parsed = Number(process.env.RATE_LIMIT_MAX);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function cleanupExpired(now) {
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}

export function aiRateLimiter(req, res, next) {
  if (!isEnabled()) {
    return next();
  }

  const now = Date.now();
  const windowMs = getWindowMs();
  const max = getMaxRequests();
  const key = getClientKey(req);

  cleanupExpired(now);

  let entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count += 1;

  res.setHeader("X-RateLimit-Limit", String(max));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > max) {
    return res.status(429).json({
      success: false,
      error: "Too many requests. Please try again later.",
    });
  }

  next();
}
