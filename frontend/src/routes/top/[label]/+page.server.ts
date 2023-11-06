import { getTopBlocked, getTopPosters } from "$lib/server/utils";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params } ) => {
    if (params.label === 'blocks') {
        const list = await getTopBlocked()
        return {
            type: params.label,
            list: list.map((x, idx) => ({idx: idx+1, ...x}))
        }
    } else if (params.label === 'posters') {
        const list = await getTopPosters()
        return {
            type: params.label,
            list: list.map((x, idx) => ({idx: idx+1, ...x}))
        } 
    } else {
        throw error(404, 'not found');
    }
}
