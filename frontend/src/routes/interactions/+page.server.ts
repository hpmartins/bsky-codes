import type { Actions, PageServerLoad } from './$types';
import { Interaction, SyncProfile } from '../../../../common/db';
import { getallDates } from '../../../../common/queries';
import { getProfile, resolveHandle, flog } from '$lib/utils';

export const load: PageServerLoad = async () => {
  const agg = await Interaction.aggregate([{ $collStats: { count: {} } }]);
  return {
    count: agg[0].count.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ','),
  };
};

export const actions = {
  default: async ({ request }) => {
    const input = await request.formData();
    const handle = input.get('handle');
    const did = await resolveHandle(handle as string);
    if (did === undefined) {
      return { handle: handle, success: false };
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
    const dates = await getallDates(did);

    flog(`searched dates @${profile.handle} [${did}]`);

    return {
      success: true,
      did: did,
      handle: profile ? profile.handle : handle,
      profile: profile,
      dates: dates,
      syncToUpdate: syncToUpdate,
    };
  },
} satisfies Actions;
