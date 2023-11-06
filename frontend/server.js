import { handler } from './build/handler.js';
import express from 'express';

const app = express();

// let SvelteKit handle everything else, including serving prerendered pages and static assets
app.use(handler);

app.listen(4040, () => {
	console.log('listening on port 4040');
});
