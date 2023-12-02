import type { RequestHandler } from './$types';
import redis from "$lib/server/redis";
import { PEOPLE_LIST_KEY } from '@common/defaults';

export const GET: RequestHandler = async ({ params }) => {
    if (params.listId && params.listId.length === 10) {
        const data = await redis.hget(PEOPLE_LIST_KEY, params.listId);
        if (data) {
            const list = JSON.parse(data);
            return new Response(list.map((x: {handle: string}) => `@${x.handle}`).join('\n'))
        }
    }
    return new Response('invalid code');
}
