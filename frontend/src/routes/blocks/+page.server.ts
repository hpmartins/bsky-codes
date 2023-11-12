import type { Actions, PageServerLoad } from './$types';
import { Block, SyncProfile } from '../../../../common/db';
import { getAllBlocks } from '../../../../common/queries'
import type { BlockType } from '$lib/types';
import { getProfile, resolveHandle } from '$lib/utils';

export const load: PageServerLoad = async () => {
  const agg = await Block.aggregate( [ { $collStats: { count: {} } } ] )
  return {
    count: agg[0].count.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")
  }
}

export const actions = {
  default: async ({ request, locals }) => {
    const input = await request.formData();
    const { handle } = JSON.parse(String(input.get('actor')));
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
