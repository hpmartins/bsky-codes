import { Block, Interaction, Post, SyncProfile } from '../../common/db';
import { syncRecords } from '../../common';
import { AtprotoData } from '@atproto/identity';
import { AppContext } from '../index';
import dayjs from 'dayjs';
import {
    AppBskyEmbedImages,
    AppBskyEmbedRecord,
    AppBskyEmbedRecordWithMedia,
    AppBskyFeedPost,
    AppBskyGraphBlock
} from '@atproto/api';

export const syncPostRecords = async (ctx: AppContext, repo: string) => {
    let cursor: string | undefined;
    let posts = 0;
    do {
        const { data } = await ctx.limiter.schedule(() =>
            ctx.api.com.atproto.repo.listRecords({
                repo: repo,
                collection: 'app.bsky.feed.post',
                limit: 100,
                cursor: cursor
            })
        );

        if (!!data && data.records.length > 0) {
            for (const record of data.records) {
                if (AppBskyFeedPost.isRecord(record.value)) {
                    let hasImages = 0;
                    let altText: string[] | null = null;
                    let quoteUri: string | null = null;

                    // post with images
                    if (AppBskyEmbedImages.isMain(record.value.embed)) {
                        hasImages = record.value.embed.images.length;
                        altText = record.value.embed.images.map((x) => x.alt);
                    }

                    // text-only post quoting a post
                    if (AppBskyEmbedRecord.isMain(record.value.embed)) {
                        quoteUri = record.value.embed.record.uri;
                    }

                    // post with media quoting a post
                    if (AppBskyEmbedRecordWithMedia.isMain(record.value.embed)) {
                        if (AppBskyEmbedRecord.isMain(record.value.embed.record)) {
                            quoteUri = record.value.embed.record.record.uri;
                        }
                        if (AppBskyEmbedImages.isMain(record.value.embed.media)) {
                            hasImages = record.value.embed.media.images.length;
                            altText = record.value.embed.media.images.map((x) => x.alt);
                        }
                    }

                    await Post.updateOne(
                        {
                            _id: record.uri
                        },
                        {
                            cid: record.cid,
                            author: repo,
                            text: record.value.text,
                            replyParent: record.value.reply?.parent.uri ?? null,
                            replyRoot: record.value.reply?.root.uri ?? null,
                            quoteUri: quoteUri ?? null,
                            altText: altText ?? null,
                            langs: record.value.langs ?? null,
                            hasImages: hasImages,
                            textLength: record.value?.text.length,
                            createdAt: dayjs(record.value.createdAt).toDate(),
                            updatedAt: dayjs().toDate()
                        },
                        { timestamps: false, strict: false, upsert: true }
                    );
                    posts++;
                }
            }
        }
        cursor = data?.cursor ?? undefined;
    } while (!!cursor && cursor.length > 0);
    return posts;
};

export const syncBlockRecords = async (ctx: AppContext, repo: string) => {
    let cursor: string | undefined;
    let blocks = 0;
    do {
        const { data } = await ctx.limiter.schedule(() =>
            ctx.api.com.atproto.repo.listRecords({
                repo: repo,
                collection: 'app.bsky.graph.block',
                limit: 100,
                cursor: cursor
            })
        );

        if (!!data && data.records.length > 0) {
            for (const record of data.records) {
                if (AppBskyGraphBlock.isRecord(record.value)) {
                    await Block.updateOne(
                        { _id: record.uri },
                        {
                            author: repo,
                            subject: record.value.subject,
                            createdAt: dayjs(record.value.createdAt).toDate(),
                            updatedAt: dayjs().toDate()
                        },
                        { timestamps: false, strict: false, upsert: true }
                    );
                    blocks++;
                }
            }
        }
        cursor = data?.cursor ?? undefined;
    } while (!!cursor && cursor.length > 0);
    return blocks;
};

export async function syncWaitingProfiles(ctx: AppContext) {
    const list = await SyncProfile.find(
        {
            updated: false,
            status: null
        },
        {},
        { limit: 1 }
    ).sort({ updatedAt: 1 });
    for (const user of list) {
        const doc = await ctx.didres.resolveAtprotoData(user._id);
        if (!!doc) await syncOneProfile(ctx, doc);
    }
}

export async function syncOneProfile(ctx: AppContext, doc: AtprotoData) {
    ctx.log(`[sync] Updating data of @${doc.handle} [${doc.did}]`);

    const uptodate = new Date('2023-11-01');

    await Interaction.updateMany(
        { '_id.author': doc.did },
        { $pull: { list: { _id: { $lt: uptodate } } } }
    );

    const options = { limiter: ctx.limiter, log: ctx.log, uptodate: uptodate };
    await syncRecords(doc, 'app.bsky.graph.block', options);
    await syncRecords(doc, 'app.bsky.feed.like', options);
    await syncRecords(doc, 'app.bsky.feed.repost', options);
    await syncRecords(doc, 'app.bsky.feed.post', options);

    await SyncProfile.findByIdAndUpdate(doc.did, {
        updated: true,
        status: 'synced'
    });

    ctx.log(`[sync] Updated profile of @${doc.handle} [${doc.did}]`);
}
