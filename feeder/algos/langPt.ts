import { InvalidRequestError } from '@atproto/xrpc-server';
import { QueryParams } from '../../common/lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../index';
import { Post } from '../../common/db';
import dayjs from 'dayjs';

// max 15 chars
export const shortname = 'lang-pt';

export const handler = async (ctx: AppContext, params: QueryParams) => {
    let qb = Post.aggregate()
        .match({
            langs: 'pt',
            createdAt: {
                $gte: dayjs().subtract(24, 'h').toDate()
            },
            deleted: false
        })
        .project({
          _id: 1,
          cid: 1,
          createdAt: 1,
        })
        .sort({
            createdAt: 'desc',
            cid: 'desc'
        })
        .limit(params.limit);

    if (params.cursor) {
        const [indexedAt, cid] = params.cursor.split('::');
        if (!indexedAt || !cid) {
            throw new InvalidRequestError('malformed cursor');
        }
        const timeStr = new Date(parseInt(indexedAt, 10)).toISOString();
        qb = qb.match({
            indexedAt: { $lte: timeStr },
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
