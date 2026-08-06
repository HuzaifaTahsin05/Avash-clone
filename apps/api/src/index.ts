import { Hono } from 'hono';
import { handleError, buildGenericErrorBody } from '@avash/logger';
import type { AppEnv } from './types';
import { requestId } from './middleware/request-id';
import { securityHeaders } from './middleware/security-headers';
import { corsMiddleware } from './middleware/cors';
import { health } from './routes/health';

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

app.notFound((c) => c.json(buildGenericErrorBody(c.get('requestId')), 404));

app.onError((error, c) => {
  const body = handleError(error, c.get('requestId'));
  return c.json(body, 500);
});

export default app;
