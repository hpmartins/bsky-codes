import dayjs from 'dayjs';
import {
    Block,
    Follow,
    ITopBlocked,
    ITopPosters,
    Like,
    Post,
    Profile,
    Repost,
    TopBlocked,
    TopPosters
} from '../../common/db';

const log = (text: string) => {
    console.log(`[${new Date().toLocaleTimeString()}] [tasker] ${text}`);
};

export const storeTopBlocked = async () => {
    const [query] = await Block.aggregate<ITopBlocked>()
        .match({
            createdAt: { $gt: dayjs().subtract(3, 'day').toDate() },
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
            createdAt: { $gt: dayjs().subtract(3, 'day').toDate() },
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

export const storeProfilesHistogram = async (after?: Date) => {
    log('[histogram] profiles: starting');
    let query = Profile.aggregate();

    if (after !== undefined) {
        query = query.match({
            createdAt: { $gte: after }
        });
    }

    query = query
        .group({
            _id: {
                $dateTrunc: { date: '$createdAt', unit: 'day' }
            },
            profiles: { $count: {} }
        })
        .append({
            $merge: {
                into: 'data_histogram',
                on: '_id',
                whenMatched: 'merge',
                whenNotMatched: 'insert'
            }
        });

    await query.exec();
    log('[histogram] profiles: done');
};

export const storeBlocksHistogram = async (after?: Date) => {
    log('[histogram] blocks: starting');
    let query = Block.aggregate();

    if (after !== undefined) {
        query = query.match({
            createdAt: { $gte: after }
        });
    }

    query = query
        .group({
            _id: {
                $dateTrunc: { date: '$createdAt', unit: 'day' }
            },
            blocks: {
                $sum: {
                    $cond: [{ $eq: ['$deleted', false] }, 1, 0]
                }
            },
            blocks_deleted: {
                $sum: {
                    $cond: [{ $eq: ['$deleted', true] }, 1, 0]
                }
            }
        })
        .append({
            $merge: {
                into: 'data_histogram',
                on: '_id',
                whenMatched: 'merge',
                whenNotMatched: 'insert'
            }
        });

    await query.exec();
    log('[histogram] blocks: done');
};

export const storeFollowsHistogram = async (after?: Date) => {
    log('[histogram] follows: starting');
    let query = Follow.aggregate();

    if (after !== undefined) {
        query = query.match({
            createdAt: { $gte: after }
        });
    }

    query = query
        .group({
            _id: {
                $dateTrunc: { date: '$createdAt', unit: 'day' }
            },
            follows: { $count: {} }
        })
        .append({
            $merge: {
                into: 'data_histogram',
                on: '_id',
                whenMatched: 'merge',
                whenNotMatched: 'insert'
            }
        });

    await query.exec();
    log('[histogram] follows: done');
};

export const storeLikesHistogram = async (after?: Date) => {
    log('[histogram] likes: starting');
    let query = Like.aggregate();

    if (after !== undefined) {
        query = query.match({
            createdAt: { $gte: after }
        });
    }

    query = query
        .group({
            _id: {
                $dateTrunc: { date: '$createdAt', unit: 'day' }
            },
            likes: { $count: {} }
        })
        .append({
            $merge: {
                into: 'data_histogram',
                on: '_id',
                whenMatched: 'merge',
                whenNotMatched: 'insert'
            }
        });

    await query.exec();
    log('[histogram] likes: done');
};

export const storeRepostsHistogram = async (after?: Date) => {
    log('[histogram] reposts: starting');
    let query = Repost.aggregate();

    if (after !== undefined) {
        query = query.match({
            createdAt: { $gte: after }
        });
    }

    query = query
        .group({
            _id: {
                $dateTrunc: { date: '$createdAt', unit: 'day' }
            },
            reposts: { $count: {} }
        })
        .append({
            $merge: {
                into: 'data_histogram',
                on: '_id',
                whenMatched: 'merge',
                whenNotMatched: 'insert'
            }
        });

    await query.exec();
    log('[histogram] reposts: done');
};

export const storePostsHistogram = async (after?: Date) => {
    log('[histogram] posts: starting');
    let query = Post.aggregate();

    if (after !== undefined) {
        query = query.match({
            createdAt: { $gte: after }
        });
    }

    query = query
        .addFields({
            imagesWithAltText: {
                $cond: [
                    { $eq: ['$altText', null] },
                    null,
                    {
                        $cond: [
                            { $eq: [{ $size: '$altText' }, 0] },
                            [],
                            {
                                $sum: {
                                    $reduce: {
                                        input: '$altText',
                                        initialValue: [],
                                        in: {
                                            $concatArrays: [
                                                '$$value',
                                                [
                                                    {
                                                        $cond: [
                                                            { $gt: [{ $strLenCP: '$$this' }, 0] },
                                                            1,
                                                            0
                                                        ]
                                                    }
                                                ]
                                            ]
                                        }
                                    }
                                }
                            }
                        ]
                    }
                ]
            }
        })
        .group({
            _id: {
                $dateTrunc: { date: '$createdAt', unit: 'day' }
            },
            posts: {
                $sum: {
                    $cond: [{ $eq: ['$deleted', false] }, 1, 0]
                }
            },
            posts_deleted: {
                $sum: {
                    $cond: [{ $eq: ['$deleted', true] }, 1, 0]
                }
            },
            characters: { $sum: '$textLength' },
            images: {
                $sum: '$hasImages'
            },
            imagesWithAltText: {
                $sum: {
                    $cond: [{ $ne: ['$imagesWithAltText', null] }, '$imagesWithAltText', 0]
                }
            }
        })
        .append({
            $merge: {
                into: 'data_histogram',
                on: '_id',
                whenMatched: 'merge',
                whenNotMatched: 'insert'
            }
        });

    await query.exec();
    log('[histogram] posts: done');
};

export const storePostsByLang = async (after?: Date) => {
    log('[histogram] posts by lang: starting');
    let query = Post.aggregate();

    if (after !== undefined) {
        query = query.match({
            createdAt: { $gte: after }
        });
    }

    query = query
        .project({
            _id: 0,
            author: 1,
            lang: {
                $cond: [
                    { $or: [{ $eq: ['$langs', null] }, { $eq: [{ $size: '$langs' }, 0] }] },
                    null,
                    { $substr: [{ $toLower: { $first: '$langs' } }, 0, 2] }
                ]
            },
            textLength: 1,
            likes: 1,
            comments: 1,
            reposts: 1,
            createdAt: 1,
        })
        .group({
            _id: {
                date: { $dateTrunc: { date: '$createdAt', unit: 'hour', binSize: 1 } },
                author: '$author',
                lang: '$lang'
            },
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
        .sort({ count: 'desc' })
        .group({
            _id: {
                date: '$_id.date',
                lang: '$_id.lang'
            },
            people: {
                $push: {
                    _id: '$_id.author',
                    count: '$count',                    
                    characters: '$characters',
                    likes: '$likes',
                    replies: '$replies',
                    reposts: '$reposts',
                }
            }
        })
        .sort({ '_id.date': 'desc' })
        .addFields({
            total: {
                count: { $sum: '$people.count' },
                characters: { $sum: '$people.characters' },
                likes: { $sum: '$people.likes' },
                replies: { $sum: '$people.replies' },
                reposts: { $sum: '$people.reposts' },
            }
        })
        .append({
            $merge: {
                into: 'languages',
                on: '_id',
                whenMatched: 'merge',
                whenNotMatched: 'insert'
            }
        });

    await query.exec();
};
