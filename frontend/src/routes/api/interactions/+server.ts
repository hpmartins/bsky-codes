import type { RequestHandler } from './$types';
import { FART_URL, FART_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ fetch, url }) => {
  let actor = url.searchParams.get('actor');
  let source = url.searchParams.get('source');

  actor = encodeURIComponent(actor ?? '')
  source = encodeURIComponent(source ?? 'from')

  const response = await fetch(
    `${FART_URL}/interactions?actor=${actor}&source=${source}`,
    {
      headers: {
        Authorization: `Bearer ${FART_KEY}`,
      },
    }
  );

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
};