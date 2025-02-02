import type { RequestHandler } from './$types';
import { FART_URL, FART_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ fetch, url }) => {
  const actor = url.searchParams.get('actor');


  const response = await fetch(
    `${FART_URL}/interactions?actor=${encodeURIComponent(actor ?? '')}`,
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