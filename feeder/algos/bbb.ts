import { InvalidRequestError } from '@atproto/xrpc-server';
import { QueryParams } from '../../common/lexicon/types/app/bsky/feed/getFeedSkeleton';
import { DynamicData, PostsPt } from '../../common/db';
import dayjs from 'dayjs';

// max 15 chars
export const shortname = 'bbb';

let TAG_LIST: string[] = [];

export const handler = async (params: QueryParams) => {
    const list = await DynamicData.findById("bbb-tags");
    if (list) TAG_LIST = list.data;

    let qb = PostsPt.aggregate()
        .match({
            createdAt: {
                $gte: dayjs().subtract(36, 'h').toDate()
            }
        })
        .addFields({
            n: { $size: '$facets' }
        })
        .match({
            n: { $gt: 0 }
        })
        .addFields({
            tags: {
                $reduce: {
                    input: '$facets.features.tag',
                    initialValue: [],
                    in: { $concatArrays: ['$$value', '$$this'] }
                }
            }
        })
        .addFields({
            n: { $size: '$tags' }
        })
        .match({
            n: { $gt: 0 }
        })
        .addFields({
            tags: {
                $map: {
                    input: '$tags',
                    as: 'tags',
                    in: { $toLower: '$$tags' }
                }
            }
        })
        .project({
            _id: 1,
            cid: 1,
            createdAt: 1,
            tags: 1
        })
        .match({
            tags: {
                $in: TAG_LIST
            }
        })
        .sort({
            createdAt: 'desc',
            cid: 'desc'
        })
        .limit(params.limit);

    if (params.cursor) {
        const [createdAt, cid] = params.cursor.split('::');
        if (!createdAt || !cid) {
            throw new InvalidRequestError('malformed cursor');
        }
        const timeStr = new Date(parseInt(createdAt, 10)).toISOString();
        qb = qb.match({
            createdAt: { $lte: timeStr },
            cid: { $lt: cid }
        });
    }

    const res = await qb.exec();
    const feed = res.map((row) => ({
        post: row._id
    }));

    let cursor: string | undefined;
    const last = res.at(-1);
    if (last) {
        cursor = `${new Date(last.createdAt).getTime()}::${last.cid}`;
    }

    return {
        cursor,
        feed
    };
};
