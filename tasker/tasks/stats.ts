import dayjs from 'dayjs';
import { Block, ITopBlocked, ITopPosters, Post, TopBlocked, TopPosters } from '../../common/db';

export const storeTopBlocked = async () => {
    const [query] = await Block.aggregate<ITopBlocked>()
        .match({
            createdAt: { $gt: dayjs().subtract(6, 'hour').toDate() },
            deleted: false
        })
        .project({ subject: '$subject' })
        .group({ _id: '$subject', count: { $count: {} } })
        .sort({ count: -1 })
        .limit(100)
        .group({ _id: new Date(), table: { $push: '$$ROOT' } });

    await TopBlocked.create(query);
};

export const storeTopPosters = async () => {
    const [query] = await Post.aggregate<ITopPosters>()
        .match({
            createdAt: { $gt: dayjs().subtract(24, 'hour').toDate() },
            deleted: false
        })
        .group({
            _id: '$author',
            count: {
                $count: {}
            },
            characters: {
                $sum: '$textLength'
            },
            likes: {
                $sum: '$likes'
            },
            replies: {
                $sum: '$comments'
            },
            reposts: {
                $sum: '$reposts'
            }
        })
        .match({ count: { $gte: 10 } })
        .sort({ count: -1 })
        .limit(200)
        .lookup({
            from: 'profiles',
            localField: '_id',
            foreignField: '_id',
            as: 'profile'
        })
        .unwind({ path: '$profile' })
        .group({ _id: new Date(), table: { $push: '$$ROOT' } });

    await TopPosters.create(query);
};

export const getFullPostHistogram = async () => {
    console.log('querying');
    const query = await Post.aggregate()
        .match({
            createdAt: { $gte: dayjs().subtract(2, 'day').toDate() }
        })
        .addFields({
            altTextLength: {
                // change so posts with no image have null length
                // change to array of lengths to check for real alt ratio
                $strLenCP: {
                    $cond: [
                        { $or: [{ $eq: ['$altText', null] }, { $eq: ['$altText', 0] }] },
                        '',
                        {
                            $reduce: {
                                input: '$altText',
                                initialValue: '',
                                in: {
                                    $cond: {
                                        if: { $eq: [{ $indexOfArray: ['$altText', '$$this'] }, 0] },
                                        then: { $concat: ['$$value', '$$this'] },
                                        else: { $concat: ['$$value', '_', '$$this'] }
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        })
        .group({
            _id: {
                $dateTrunc: { date: '$createdAt', unit: 'day' }
            },
            posts: { $count: {} },
            characters: { $sum: '$textLength' },
            altNone: {
                $sum: {
                    $cond: [{ $eq: ['$altTextLength', 0] }, 1, 0]
                }
            },
            altSome: {
                $sum: {
                  $cond: [{ $gt: ['$altTextLength', 0] }, 1, 0]
                }
            },
        });
    console.log(query);
};
