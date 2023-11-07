import {
  AppBskyEmbedImages,
  AppBskyEmbedRecord,
  AppBskyEmbedRecordWithMedia,
  AppBskyFeedLike,
  AppBskyFeedPost,
  AppBskyFeedRepost,
  AppBskyGraphBlock
} from '@atproto/api';
import Bottleneck from 'bottleneck';
import { updatePartition, listRecords, listRepos } from '../../common/index';
import { Block, Post, Profile, SyncProfile, SyncState } from '../../common/db';
import { AtprotoData, DidResolver } from '@atproto/identity';
import { OutputSchema as ListRecordsSchema } from '../../lexicon/types/com/atproto/repo/listRecords';

export async function syncRecords(doc: AtprotoData, collection: string, start?: string, limiter?: Bottleneck, uptodate?: Date) {
  let cursor: string | undefined;

  if (!uptodate) {
    uptodate = new Date('2023-11-01');
  }

  if (!!start) {
    cursor = start;
  }

  await SyncProfile.findByIdAndUpdate(
    doc.did,
    {
      updated: false,
      status: `updating ${collection}`
    },
    { upsert: true }
  );

  do {
    console.log(`[sync] ${doc.did}/${collection} @ ${cursor}`);
    await SyncState.updateOne(
      { _id: 'main' },
      {
        col: collection,
        colCursor: cursor
      }
    );

    let response: ListRecordsSchema | undefined;
    if (limiter) {
      response = await limiter.schedule(async () =>
        listRecords(doc.pds, {
          repo: doc.did,
          collection: collection,
          limit: 100,
          cursor: cursor,
          reverse: true
        })
      );
    } else {
      response = await listRecords(doc.pds, {
        repo: doc.did,
        collection: collection,
        limit: 100,
        cursor: cursor,
        reverse: true
      });
    }

    if (response && response.records.length > 0) {
      for (const record of response.records) {
        if (AppBskyGraphBlock.isRecord(record.value)) {
          await Block.updateOne(
            { _id: record.uri },
            {
              author: doc.did,
              subject: record.value.subject,
              createdAt: new Date(record.value.createdAt),
              updatedAt: new Date(record.value.createdAt)
            },
            { upsert: true, timestamps: false, strict: false }
          );
        }
        if (AppBskyFeedLike.isRecord(record.value)) {
          if (new Date(record.value.createdAt) < uptodate && record.value.subject.uri.includes('app.bsky.feed.post')) {
            const date = new Date(record.value.createdAt).toLocaleDateString('en-CA');
            await updatePartition(
              doc.did,
              record.value.subject.uri.slice(5, 37),
              date,
              { 'list.$.likes': 1 },
              { _id: date, likes: 1 }
            );
          }
        }
        if (AppBskyFeedRepost.isRecord(record.value)) {
          if (new Date(record.value.createdAt) < uptodate && record.value.subject.uri.includes('app.bsky.feed.post')) {
            const date = new Date(record.value.createdAt).toLocaleDateString('en-CA');
            await updatePartition(
              doc.did,
              record.value.subject.uri.slice(5, 37),
              date,
              { 'list.$.reposts': 1 },
              { _id: date, reposts: 1 }
            );
          }
        }
        if (AppBskyFeedPost.isRecord(record.value)) {
          if (new Date(record.value.createdAt) < uptodate) {
            const date = new Date(record.value.createdAt).toLocaleDateString('en-CA');

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
              if (AppBskyEmbedImages.isMain(record.value.embed?.media)) {
                hasImages = record.value.embed.media.images.length;
                altText = record.value.embed.media.images.map((x) => x.alt);
              }
            }

            await Post.updateOne(
              { _id: record.uri },
              {
                author: doc.did,
                text: record.value.text,
                replyParent: record.value.reply?.parent.uri ?? null,
                replyRoot: record.value.reply?.root.uri ?? null,
                quoteUri: quoteUri ?? null,
                altText: altText ?? null,
                langs: record.value.langs ?? null,
                hasImages: hasImages,
                textLength: record.value.text.length,
                createdAt: new Date(record.value.createdAt),
                updatedAt: new Date(record.value.createdAt)
              },
              { upsert: true, timestamps: false, strict: false }
            );

            if (!!record.value.reply?.parent.uri.length) {
              const subject = record.value.reply.parent.uri.split('/')[2];
              await updatePartition(
                doc.did,
                subject,
                date,
                {
                  'list.$.replies': 1,
                  'list.$.characters': record.value.text.length
                },
                { _id: date, replies: 1, characters: record.value.text.length }
              );
            }

            if (!!quoteUri) {
              const subject = quoteUri.split('/')[2];
              await updatePartition(
                doc.did,
                subject,
                date,
                {
                  'list.$.replies': 1,
                  'list.$.characters': record.value.text.length
                },
                { _id: date, replies: 1, characters: record.value.text.length }
              );
            }
          }
        }
      }
    }
    cursor = response?.cursor ?? undefined;
  } while (!!cursor && cursor.length > 0);
}

export async function runSync(limiter: Bottleneck) {
  let repoIndex: number = 0;
  let repoCursor: string | undefined;

  const didres = new DidResolver({});

  // Backfilling
  const syncState = await SyncState.findById('main');
  let collection: string | undefined;
  let collectionCursor: string | undefined;
  if (!!syncState) {
    repoCursor = syncState.repoCursor ?? undefined;
    collection = syncState.col ?? undefined;
    collectionCursor = syncState.colCursor ?? undefined;
  }

  do {
    const response = await limiter.schedule(async () =>
      listRepos({
        limit: 200,
        cursor: repoCursor
      })
    );
    repoIndex = 0;

    if (response && response.repos) {
      for (const [idx, repo] of response.repos.entries()) {
        if (syncState && repoCursor === syncState.repoCursor && idx < syncState.repoIndex) {
          repoIndex++;
          continue;
        }

        const doc = await didres.resolveAtprotoData(repo.did);
        if (!doc) {
          repoIndex++;
          continue;
        }

        const syncProfile = await SyncProfile.findById(repo.did);
        if (!!syncProfile && syncProfile.updated) {
          console.log(`Already updated: ${repo.did}`);
          repoIndex++;
          continue;
        } else {
          await SyncProfile.findByIdAndUpdate(
            repo.did,
            {
              updated: false,
              status: 'updating'
            },
            { upsert: true }
          );
        }

        await Profile.findByIdAndUpdate(
          {
            _id: repo.did
          },
          {
            handle: doc.handle
          },
          { upsert: true }
        );

        console.log(doc.did, doc.handle);

        await SyncState.updateOne(
          { _id: 'main' },
          {
            repoCursor: repoCursor,
            repoIndex: idx,
            repoDid: repo.did
          },
          { upsert: true }
        );

        if (!collection) {
          await syncRecords(doc, 'app.bsky.graph.block', undefined, limiter);
          await syncRecords(doc, 'app.bsky.feed.like', undefined, limiter);
          await syncRecords(doc, 'app.bsky.feed.repost', undefined, limiter);
          await syncRecords(doc, 'app.bsky.feed.post', undefined, limiter);
        } else {
          if (collection === 'app.bsky.graph.block') {
            await syncRecords(doc, 'app.bsky.graph.block', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.like', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.repost', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.post', collectionCursor, limiter);
          } else if (collection === 'app.bsky.feed.like') {
            await syncRecords(doc, 'app.bsky.feed.like', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.repost', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.post', collectionCursor, limiter);
          } else if (collection === 'app.bsky.feed.repost') {
            await syncRecords(doc, 'app.bsky.feed.repost', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.post', collectionCursor, limiter);
          } else if (collection === 'app.bsky.feed.post') {
            await syncRecords(doc, 'app.bsky.feed.post', collectionCursor, limiter);
          }
          collection = undefined;
          collectionCursor = undefined;
        }

        await SyncProfile.findByIdAndUpdate(repo.did, {
          updated: true,
          status: 'backfilled'
        });

        repoIndex++;
      }
    }
    repoCursor = response?.cursor ?? undefined;
  } while (!!repoCursor && repoCursor.length > 0);
}
