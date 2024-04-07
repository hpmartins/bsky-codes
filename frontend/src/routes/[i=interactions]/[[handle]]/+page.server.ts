import type { PageServerLoad } from './$types';
import { updateProfile } from '@common';
import { getAllDates } from '@common/queries';
import { resolveHandle, flog, getDateOfIsoWeek } from '$lib/utils';

export const load: PageServerLoad = async ({ url, params }) => {
    const base = url.pathname.split('/').slice(0, 2).join('/');

    if (params.handle) {
        let { handle } = params;

        handle = handle.replace(/^@/, '');

        const did = await resolveHandle(handle);
        if (did === undefined) {
            return { base: base, success: false, handle: handle };
        }
        const profile = await updateProfile(did);
        if (profile === undefined) {
            return { base: base, success: false, handle: handle };
        }

        let dates: { week: number; year: number; count: number; date?: Date }[] = await getAllDates(did);
        dates = dates.map(x => ({...x, date: getDateOfIsoWeek(x.week, x.year)}))

        flog(`searched dates @${handle} [${did}]`);

        return {
            base: base,
            success: true,
            did: did,
            handle: profile.handle,
            profile: profile,
            dates: dates,
        };

        // if (dbProfile) {
        //     let dates: { week: number; year: number; count: number; date?: Date }[] = await getAllDates(dbProfile._id);
        //     dates = dates.map(x => ({...x, date: getDateOfIsoWeek(x.week, x.year)}))
    
        //     flog(`searched dates @${dbProfile.handle} [${dbProfile._id}]`);
    
        //     return {
        //         base: base,
        //         success: true,
        //         did: dbProfile._id,
        //         handle: dbProfile.handle,
        //         profile: JSON.parse(JSON.stringify(dbProfile)),
        //         dates: dates,
        //         // syncToUpdate: syncToUpdate,
        //     };
        // }

        // return { base: base, success: false, handle: handle };

        // let syncToUpdate = false;
        // const syncProfile = await SyncProfile.findById(did);
        // if (!syncProfile) {
        //     await SyncProfile.updateOne(
        //         { _id: did },
        //         {
        //             updated: false,
        //         },
        //         { upsert: true },
        //     );
        //     syncToUpdate = true;
        // }
    } else {
        return {
            base: base,
            handle: undefined,
        };
    }
};
