import RateLimitHit from "../models/rateLimitHit.model.js";
import logger from "../utils/logger.js";

// Fixed-window counter backed by MongoDB (see models/rateLimitHit.model.js) instead of
// express-rate-limit's in-memory store. A single Node server can safely count requests in
// process memory; Vercel Functions cannot — concurrent invocations may land on different,
// memory-isolated instances, so an in-memory counter would let a burst spread across instances
// exceed the configured limit. Reusing the same MongoDB Atlas connection this app already has
// keeps this a small addition rather than a new infrastructure dependency.
export function mongoRateLimit({ scope, windowMs, max, message }) {
  return async function rateLimiter(req, res, next) {
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const key = `${scope}:${req.ip}:${windowStart}`;

    let count;
    try {
      const hit = await RateLimitHit.findOneAndUpdate(
        { key },
        {
          $inc: { count: 1 },
          // Only set on the window's first hit; the extra minute past windowMs is slack so the
          // TTL background task (which runs periodically, not instantly) never deletes a
          // window's counter before that window has fully elapsed.
          $setOnInsert: { expiresAt: new Date(windowStart + windowMs + 60_000) },
        },
        { upsert: true, returnDocument: "after" }
      );
      count = hit.count;
    } catch (err) {
      // Fails open: rate limiting is a protective layer, not the primary correctness
      // guarantee. A request let through during a brief MongoDB outage fails moments later
      // anyway, when the actual application save/read hits the same outage.
      logger.warn("rate_limiter_unavailable", { requestId: req.requestId, scope });
      return next();
    }

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - count)));

    if (count > max) {
      return res.status(429).json({ success: false, message, code: "RATE_LIMIT_EXCEEDED" });
    }

    next();
  };
}
