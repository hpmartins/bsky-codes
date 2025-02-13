import type { PageServerLoad } from './$types';
import { FART_URL } from '$env/static/private';

export const load: PageServerLoad = async ({ fetch }) => {
    let top_blocks: Record<string, any> = {}

    try {
        const response = await fetch(`${FART_URL}/dd/top_blocks`)
        if (response.ok) {
            top_blocks = await response.json()
        }
    } catch (error) {
        console.error('error fetching data')
        top_blocks = {}
    }

    return {
        top_blocks: top_blocks
    }
};
