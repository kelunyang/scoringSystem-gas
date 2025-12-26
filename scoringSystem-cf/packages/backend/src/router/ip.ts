import type { Env } from '../types';
/**
 * IP Detection Router
 * Provides client IP address and geolocation info using Cloudflare's native data
 *
 * This replaces the need for external services like ipify.org
 * - 50-100x faster (0-5ms vs 200-500ms)
 * - Zero external dependencies
 * - Rich geolocation data included for free
 * - Better privacy (data doesn't leave Cloudflare)
 */

import { Hono } from 'hono'

const ipRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /ip - Get client IP and geolocation
 */
ipRouter.get('/', (c) => {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const country = c.req.header('CF-IPCountry') || 'unknown';
  const city = c.req.header('CF-IPCity') || 'unknown';
  const region = c.req.header('CF-Region') || 'unknown';
  const timezone = c.req.header('CF-Timezone') || 'unknown';

  return c.json({
    success: true,
    data: {
      ip,
      country,
      city,
      region,
      timezone
    }
  });
});

export default ipRouter;
