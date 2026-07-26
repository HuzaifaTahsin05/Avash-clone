import { Hono } from 'hono';
export const riskMap = new Hono().get('/', (c) => c.json([]));
