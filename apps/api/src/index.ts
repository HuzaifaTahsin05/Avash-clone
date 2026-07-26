import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.text('Avash API (Cloudflare Worker) is running!'));

export default app;
