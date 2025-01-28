import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch, url }) => {
  const actor = url.searchParams.get('actor');
  const api_key = "";

  const response = await fetch(
    `http://localhost:8000/interactions?actor=${encodeURIComponent(actor ?? '')}`,
    {
      headers: {
        Authorization: `Bearer ${api_key}`,
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