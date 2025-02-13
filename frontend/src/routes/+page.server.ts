import type { PageServerLoad } from './$types';
import { FART_URL } from '$env/static/private';

interface collStatsData {
    [key: string]: number
}

export const load: PageServerLoad = async ({ fetch }) => {
    let collStats: collStatsData = {}

    // try {
    //     const response = await fetch(`${FART_URL}/collStats`)
    //     if (response.ok) {
    //         collStats = await response.json()
    //     }
    // } catch (error) {
    //     console.error('error fetching data')
    // }

    return {
        collStats
    }
};
