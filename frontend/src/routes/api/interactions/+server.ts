import { flog } from '$lib/utils';
import { searchInteractions } from '../../../../../common/queries';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const input: {
        did: string;
        handle: string;
        weekly?: {
            week: string;
            year: string;
        };
        range?: string;
    } = await request.json();

    flog(`searched interactions @${input.handle} [${input.did}]`);

    const interactions = await searchInteractions(input);
    if (interactions) {
        return new Response(JSON.stringify(interactions));
    }
    return new Response();
};
