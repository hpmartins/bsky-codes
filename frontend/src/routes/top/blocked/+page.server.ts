import type { PageServerLoad } from './$types';
import { TopBlocked } from '@common/db';
import dayjs from 'dayjs';

export const load: PageServerLoad = async () => {
    const query = await TopBlocked.aggregate()
        .match({ _id: { $gt: dayjs().subtract(24, 'hour').toDate() } })
        .sort({ _id: -1 })
        .limit(1)
        .unwind('table')
        .lookup({
            from: 'profiles',
            localField: 'table._id',
            foreignField: '_id',
            as: 'profile',
        })
        .unwind('profile')
        .group({
            _id: '$_id',
            table: {
                $push: {
                    _id: '$table._id',
                    count: '$table.count',
                    profile: {
                        handle: '$profile.handle',
                        displayName: '$profile.displayName',
                        avatar: '$profile.avatar',
                    },
                },
            },
        });

    if (query && query.length > 0) {
        const table: {
            _id: string;
            count: number;
            profile: {
                handle: string;
                displayName: string;
                avatar: string;
            };
        }[] = query[0].table;
        return {
            found: true,
            date: query[0]._id as Date,
            list: table.map((x, idx) => ({ idx: idx + 1, ...x })),
        };
    }

    return { found: false };
};
