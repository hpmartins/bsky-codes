import { handler } from './build/handler.js';
import express from 'express';
import 'dotenv/config';

const app = express();

const port = process.env.FRONTEND_PORT ?? 6000;

app.use(handler);

app.listen(port, () => {
    console.log(`[${new Date().toLocaleTimeString()}] [frontend] listening on port ${port}`);
});
