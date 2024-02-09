import type { Actions, PageServerLoad } from './$types';
import { Block, Profile, SyncProfile } from '../../../../common/db';
import { getAllBlocks } from '../../../../common/queries';
import type { BlockType } from '$lib/types';
import { flog, getProfile, resolveHandle } from '$lib/utils';

export const actions = {
    default: async ({ request, locals }) => {
        const input = await request.formData();
        const handle = String(input.get('handle')).replace(/^@/, '');
        const s = (handle.match(/\./g) || []).length;
        const attempt = s ? handle : `${handle}.bsky.social`;

        const dbProfile = await Profile.findOne({ handle: attempt })

        if (dbProfile) {
            const blocksSent = await getAllBlocks(dbProfile._id, 'author');
            const blocksRcvd = await getAllBlocks(dbProfile._id, 'subject');
            flog(`searched blocks @${dbProfile.handle} [${dbProfile._id}]`);
            return {
                did: dbProfile._id,
                handle: dbProfile.handle,
                success: true,
                blocks: {
                    sent: blocksSent as unknown as BlockType[],
                    rcvd: blocksRcvd as unknown as BlockType[],
                },
            };
        }
        return { handle: handle, success: false };
    },
} satisfies Actions;
