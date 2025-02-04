import type { RequestHandler } from './$types';
import { FART_URL, FART_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ fetch, url }) => {
  let record_type = url.searchParams.get('record_type');
  let name = url.searchParams.get('name');

  record_type = encodeURIComponent(record_type ?? '')
  name = encodeURIComponent(name ?? '')

  const response = await fetch(
    `${FART_URL}/fetch/top/${record_type}/${name}`,
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