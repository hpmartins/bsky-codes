import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const actor = url.searchParams.get('actor');

  if (actor) {
    try {
      const response = await fetch(`/api/interactions?actor=${encodeURIComponent(actor)}`);
      if (response.ok) {
        const interactions = await response.json();
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