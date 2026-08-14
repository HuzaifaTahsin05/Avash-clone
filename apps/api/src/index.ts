import { Hono } from 'hono';
import { handleError, buildGenericErrorBody } from '@avash/logger';
import type { AppEnv } from './types';
import { requestId } from './middleware/request-id';
import { securityHeaders } from './middleware/security-headers';
import { corsMiddleware } from './middleware/cors';
import { health } from './routes/health';
import { weather } from './routes/weather';
import { riskMap, riskDetail } from './routes/risk-map';

const app = new Hono<AppEnv>();

// Middleware chain order, per docs/standards/backend.md:
// request-id -> security-headers -> cors -> routes -> onError.
app.use('*', requestId());
app.use('*', securityHeaders());
app.use('*', corsMiddleware());

app.get('/', (c) =>
  c.json({
    message: 'Welcome to Avash API',
    requestId: c.get('requestId'),
  })
);

app.route('/health', health);
// Public reads, cors+headers only — no rate-limit middleware (§6 amendment;
// the §6 discrepancy between the 60/min claim and this chain is flagged,
// not resolved, pending the security-hardening slice).
app.route('/api/weather', weather);
app.route('/api/risk-map', riskMap);
app.route('/api/risk', riskDetail);

app.notFound((c) => c.json(buildGenericErrorBody(c.get('requestId')), 404));

app.onError((error, c) => {
  const body = handleError(error, c.get('requestId'));
  return c.json(body, 500);
});

export default app;
