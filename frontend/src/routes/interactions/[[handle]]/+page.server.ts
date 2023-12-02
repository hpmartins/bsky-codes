import type { PageServerLoad } from './$types';
import { SyncProfile } from '@common/db';
import { getAllDates } from '@common/queries';
import { getProfile, resolveHandle, flog } from '$lib/utils';

export const load: PageServerLoad = async ({ params }) => {
    if (params.handle) {
        const { handle } = params;

        const did = await resolveHandle(handle);
        if (did === undefined) {
            return { success: false, handle: handle };
        }

        let syncToUpdate = false;
        const syncProfile = await SyncProfile.findById(did);
        if (!syncProfile) {
            await SyncProfile.updateOne(
                { _id: did },
                {
                    updated: false,
                },
                { upsert: true },
            );
            syncToUpdate = true;
        }

        const profile = await getProfile(did);
        const dates = await getAllDates(did);

        flog(`searched dates @${handle} [${did}]`);

        return {
            success: true,
            did: did,
            handle: handle,
            profile: profile,
            dates: dates,
            syncToUpdate: syncToUpdate,
        };
    } else {
        return {
            handle: undefined,
        };
    }
};
