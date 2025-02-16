import type { PageServerLoad } from './$types';
import type { InteractionsResponse } from '$lib/types';
import { FART_URL } from '$env/static/private';

export const load: PageServerLoad = async ({ fetch, params }) => {
  if (!params.handle) {
    return {}
  }

  try {
    const response = await fetch(`${FART_URL}/interactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ handle: params.handle })
    })

    const response_data: InteractionsResponse = await response.json()
    if (response.ok) {
      return {
        success: true,
        did: response_data.did,
        handle: response_data.handle,
        interactions: response_data.interactions,
      }
    } else {
      return {
        success: false,
        error: response_data.detail,
      }
    }
  } catch (error) {
    return {
      success: false,
      error: "error fetching interactions",
    }
  }
};
