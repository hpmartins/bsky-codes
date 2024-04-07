import type { Actions } from './$types';
import { getAllBlocks } from '../../../../common/queries';
import type { BlockType } from '$lib/types';
import { flog, resolveHandle } from '$lib/utils';
import { updateProfile } from '@common';

export const actions = {
    default: async ({ request, locals }) => {
        const input = await request.formData();
        const handle = String(input.get('handle')).replace(/^@/, '');

        const did = await resolveHandle(handle);
        if (did === undefined) {
            return { success: false, handle: handle };
        }
        const profile = await updateProfile(did);
        if (profile === undefined) {
            return { success: false, handle: handle };
        }

        if (did === 'did:plc:rjlu6npi554qkz2jcvdt7mc3') {
            return { handle: handle, success: false };
        }
        
        const blocksSent = await getAllBlocks(did, 'author');
        const blocksRcvd = await getAllBlocks(did, 'subject');
        flog(`searched blocks @${profile.handle} [${did}]`);
        return {
            did: did,
            handle: profile.handle,
            success: true,
            blocks: {
                sent: blocksSent as unknown as BlockType[],
                rcvd: blocksRcvd as unknown as BlockType[],
            },
        };
    },
} satisfies Actions;
