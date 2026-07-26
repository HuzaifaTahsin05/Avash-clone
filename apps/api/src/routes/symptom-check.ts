import { Hono } from 'hono';
export const symptomCheck = new Hono().post('/', (c) => c.json({}));
