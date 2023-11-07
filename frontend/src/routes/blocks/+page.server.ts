import type { Actions } from './$types';
import { SyncProfile } from '@common/db';
import { getAllBlocks } from '@common/queries'
import type { BlockType } from '$lib/types';
import { getProfile, resolveHandle } from '$lib/utils';

export const actions = {
  default: async ({ request, locals }) => {
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

    const profile = await getProfile(did)
    const blocksSent = await getAllBlocks(did, 'author');
    const blocksRcvd = await getAllBlocks(did, 'subject');

    return {
      did: did,
      handle: profile ? profile.handle : handle,
      success: true,
      blocks: {
        sent: blocksSent as unknown as BlockType[],
        rcvd: blocksRcvd as unknown as BlockType[]
      },
      syncToUpdate: syncToUpdate
    };
  }
} satisfies Actions;
