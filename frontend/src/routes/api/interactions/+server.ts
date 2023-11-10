import { getInteractions, getInteractionsByDateRange } from "../../../../../common/queries";
import type { RequestHandler } from './$types';
import dayjs, { Dayjs } from 'dayjs';

export const POST: RequestHandler =  async( { request }) => {
    const input: {
        did: string;
        weekly?: {
            week: string;
            year: string;
        }
        range?: string;
    } = await request.json();

    if (input.weekly) {
        const sent = await getInteractions(input.did, 'author', input.weekly.week, input.weekly.year)
        const rcvd = await getInteractions(input.did, 'subject', input.weekly.week, input.weekly.year)
        return new Response(JSON.stringify({
            sent: sent.map((x, idx) => ({idx: idx+1, ...x})),
            rcvd: rcvd.map((x, idx) => ({idx: idx+1, ...x})),
        }));
    } else if (input.range) {
        let start: Date | undefined = undefined;
        let limit = 3000;
        if (input.range === 'all') {
            start = dayjs().subtract(10, 'year').toDate()
            limit = 1000;
        } else if (input.range === 'month') {
            start = dayjs().subtract(1, 'month').startOf('day').toDate()
        } else if (input.range === 'week') {
            start = dayjs().subtract(1, 'week').startOf('day').toDate()
        } else if (input.range === 'day') {
            start = dayjs().subtract(24, 'hour').startOf('day').toDate()
        }

        if (start !== undefined) {
            const sent = await getInteractionsByDateRange(input.did, "author", { start: start, limit: limit })
            const rcvd = await getInteractionsByDateRange(input.did, "subject", { start: start, limit: limit })
            return new Response(JSON.stringify({
                sent: sent.map((x, idx) => ({idx: idx+1, ...x})),
                rcvd: rcvd.map((x, idx) => ({idx: idx+1, ...x})),
            }));
        }
    }
    return new Response();
};
