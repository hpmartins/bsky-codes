import type { Handle } from "@sveltejs/kit";
import { connect } from "mongoose";
import { MONGODB_URI } from "$env/static/private";

export const handle: Handle = async ({event, resolve}) => {
    await connect(MONGODB_URI ?? 'mongodb://localhost');
    return await resolve(event)
}
