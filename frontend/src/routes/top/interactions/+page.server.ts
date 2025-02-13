import type { PageServerLoad } from './$types';
import { FART_URL } from '$env/static/private';

export const load: PageServerLoad = async ({ fetch }) => {
    let top_interactions: Record<string, any> = {}

    try {
        const response = await fetch(`${FART_URL}/dd/top_interactions`)
        if (response.ok) {
            top_interactions = await response.json()
        }
    } catch (error) {
        console.error('error fetching data')
        top_interactions = {}
    }

    return {
        top_interactions: top_interactions,
    }
};
