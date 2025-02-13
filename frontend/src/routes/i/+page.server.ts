import type { PageServerLoad } from './$types';
import { FART_URL } from '$env/static/private';
import type { InteractionsDataType } from '$lib/types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const actor = url.searchParams.get('actor');

  let interactions: InteractionsDataType = {from: [], to: []}

  if (actor) {
    try {
      const response = await fetch(`${FART_URL}/interactions?actor=${encodeURIComponent(actor)}&source=both`);
      if (response.ok) {
        interactions = await response.json();
        return {
          interactions: interactions,
          actor: actor,
        };
      } else {
        console.error('Failed to fetch data:', response.status);
        return {
          interactions: null,
          actor: actor,
          error: 'Failed to fetch data',
        };
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      return {
        interactions: null,
        actor: actor,
        error: 'An error occurred while fetching data',
      };
    }
  }

  return {
    interactions: null,
    actor: null,
  };
};