import { Hono } from 'hono';
export const alerts = new Hono().post('/', (c) => c.json({}));
