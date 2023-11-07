import { getInteractions } from "@common/queries";
import type { RequestHandler } from './$types';

export const POST: RequestHandler =  async( { request }) => {
    const input = await request.json();
    const sent = await getInteractions(input.did, 'author', input.week, input.year)
    const rcvd = await getInteractions(input.did, 'subject', input.week, input.year)
    return new Response(JSON.stringify({
        sent: sent.map((x, idx) => ({idx: idx+1, ...x})),
        rcvd: rcvd.map((x, idx) => ({idx: idx+1, ...x})),
    }));
};
