import type { Handle } from '@sveltejs/kit';
import { MONGODB_URI } from '$env/static/private';
import { connectDb } from '../../common/db';

export const handle: Handle = async ({ event, resolve }) => {
    await connectDb(MONGODB_URI);
    return await resolve(event);
};
