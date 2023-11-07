import type { Actions } from './$types';
import { SyncProfile } from '@common/db';
import { getallDates } from '@common/queries';
import { getProfile, resolveHandle } from '$lib/utils';

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
          updated: false
        },
        { upsert: true }
      );
      syncToUpdate = true;
    }

    const profile = await getProfile(did);
    const dates = await getallDates(did);

    return {
      success: true,
      did: did,
      handle: profile ? profile.handle : handle,
      profile: profile,
      dates: dates,
      syncToUpdate: syncToUpdate
    };
  }
} satisfies Actions;
