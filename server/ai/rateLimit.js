const buckets = new Map();

export function createAIRateLimiter() {
  const limit = Math.max(1, Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 20));
  const windowMs = 60_000;

  return function aiRateLimiter(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || "local";
    const now = Date.now();
    const bucket = buckets.get(key) ?? { count: 0, resetAt: now + windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > limit) {
      res.status(429).json({
        error: "AI 请求过于频繁，请稍后再试。",
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}
