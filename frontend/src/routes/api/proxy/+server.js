import { error } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').RequestHandler} */
export const GET = ({ url }) => {
    const src = String(url.searchParams.get('src') ?? '');

    const targetUrl = new URL(src);

    if (targetUrl.host !== 'cdn.bsky.app') {
        throw error(400, 'invalid src');
    }
    return fetch(targetUrl.href);
};
