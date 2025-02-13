import type { RequestHandler } from './$types';
import { FART_URL } from '$env/static/private';
import type { InteractionsDataType, InteractionsInternalDataType } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
    const input: {
        did: string;
        handle: string;
    } = await request.json();

    console.log(`searched interactions @${input.handle} [${input.did}]`);

    let response: InteractionsInternalDataType = { success: false, error: 'error fetching interactions' };
    let interactions: InteractionsDataType = { from: [], to: [] }
    try {
        const fart = await fetch(`${FART_URL}/interactions?actor=${encodeURIComponent(input.did)}&source=both`);
        if (fart.ok) {
            interactions = await fart.json();
            response = {
                success: true,
                did: input.did,
                handle: input.handle,
                interactions,
            };
        } else {
            console.error('Failed to fetch data:', fart.status);
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    }

    return new Response(JSON.stringify(response));
};
