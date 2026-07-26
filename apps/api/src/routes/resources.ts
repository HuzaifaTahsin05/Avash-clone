import { Hono } from 'hono';
export const resources = new Hono().get('/', (c) => c.json([]));
