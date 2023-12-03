import type { PageServerLoad } from './$types';
import { SyncProfile } from '@common/db';
import { getAllDates } from '@common/queries';
import { getProfile, resolveHandle, flog, getDateOfIsoWeek } from '$lib/utils';

export const load: PageServerLoad = async ({ url, params }) => {
    const base = url.pathname.split('/').slice(0, 2).join('/');

    if (params.handle) {
        const { handle } = params;

        const did = await resolveHandle(handle);
        if (did === undefined) {
            return { base: base, success: false, handle: handle };
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
        let dates: { week: number; year: number; count: number; date?: Date }[] = await getAllDates(did);
        dates = dates.map(x => ({...x, date: getDateOfIsoWeek(x.week, x.year)}))

        flog(`searched dates @${handle} [${did}]`);

        return {
            base: base,
            success: true,
            did: did,
            handle: handle,
            profile: profile,
            dates: dates,
            syncToUpdate: syncToUpdate,
        };
    } else {
        return {
            base: base,
            handle: undefined,
        };
    }
};
