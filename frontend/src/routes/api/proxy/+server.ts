import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const src = String(url.searchParams.get('src') ?? '');

  const targetUrl = new URL(src);

  if (targetUrl.host !== 'cdn.bsky.app') {
    throw error(400, 'invalid src');
  }
  return fetch(targetUrl.href);
};
