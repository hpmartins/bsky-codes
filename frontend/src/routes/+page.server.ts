import type { PageServerLoad } from './$types';
import { FART_URL } from '$env/static/private';

export const load: PageServerLoad = async ({ fetch }) => {
    let top_interactions: Record<string, any> = {}
    let top_blocks: Record<string, any> = {}

    try {
        const response = await fetch(`${FART_URL}/dd/top_interactions`)
        if (response.ok) {
            top_interactions = await response.json()
        }
    } catch (error) {
        console.error('error fetching data')
        top_interactions = {}
    }

    try {
        const response = await fetch(`${FART_URL}/dd/top_blocks`)
        console.log(response)
        if (response.ok) {
            top_blocks = await response.json()
        }
    } catch (error) {
        console.error('error fetching data')
        top_blocks = {}
    }

    return {
        top_interactions: top_interactions,
        top_blocks: top_blocks
    }
};
