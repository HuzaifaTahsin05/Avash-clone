import { Hono } from 'hono';
export const reports = new Hono().post('/', (c) => c.json({}));
