import { InvalidRequestError } from '@atproto/xrpc-server';
import { QueryParams } from '../../common/lexicon/types/app/bsky/feed/getFeedSkeleton';
import { PostsPt } from '../../common/db';
import dayjs from 'dayjs';

// max 15 chars
export const shortname = 'lang-pt';

export const handler = async (params: QueryParams) => {
    let qb = PostsPt.aggregate()
        .match({
            createdAt: {
                $gte: dayjs().subtract(24, 'h').toDate()
            },
        })
        .project({
            _id: 1,
            cid: 1,
            createdAt: 1
        })
        .sort({
            createdAt: 'desc',
            cid: 'desc'
        });

    if (params.cursor) {
        const [createdAt, cid] = params.cursor.split('::');
        if (!createdAt || !cid) {
            throw new InvalidRequestError('malformed cursor');
        }
        const timeStr = new Date(parseInt(createdAt, 10));
        qb = qb.match({
            createdAt: { $lte: timeStr },
            cid: { $lt: cid }
        });
    }

    qb = qb.limit(params.limit);

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
