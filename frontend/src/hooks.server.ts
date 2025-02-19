import type { HandleFetch } from '@sveltejs/kit';
import { FART_URL, FART_KEY } from '$env/static/private';

export const handleFetch: HandleFetch = async ({ request, fetch }) => {
    if (request.url.startsWith(FART_URL)) {
        request.headers.set('X-API-Key', FART_KEY);
    }
    return fetch(request);
};