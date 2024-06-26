import {
  AppBskyEmbedImages,
  AppBskyEmbedRecord,
  AppBskyEmbedRecordWithMedia,
  AppBskyFeedLike,
  AppBskyFeedPost,
  AppBskyFeedRepost,
  AppBskyGraphBlock,
} from '@atproto/api';
import Bottleneck from 'bottleneck';
import { Block, Post, Profile, Interaction, SyncProfile, SyncState } from '../common/db';
import { AtprotoData } from '@atproto/identity';
import { ProfileViewDetailed } from "./lexicon/types/app/bsky/actor/defs";
import { OutputSchema as ListReposSchema } from "./lexicon/types/com/atproto/sync/listRepos";
import { OutputSchema as ListRecordsSchema } from "./lexicon/types/com/atproto/repo/listRecords";
import dayjs from 'dayjs';
import minMax from 'dayjs/plugin/minMax';
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post';
dayjs.extend(minMax);

export const getDateTime = (date?: number | Date) => {
  if (!date) return new Date().toISOString().slice(0, 19).replace("T", " ");
  return new Date(date).toISOString().slice(0, 19).replace("T", " ");
};

export const maybeBoolean = (val?: string) => {
  if (!val) return undefined;
  const int = parseInt(val, 10);
  if (isNaN(int)) return undefined;
  return !!int;
};

export const maybeStr = (val?: string) => {
  if (!val) return undefined;
  return val;
};

export const maybeInt = (val?: string) => {
  if (!val) return undefined;
  const int = parseInt(val, 10);
  if (isNaN(int)) return undefined;
  return int;
};

export async function syncRecords(
  doc: AtprotoData, 
  collection: string, 
  options?: {
    start?: string;
    limiter?: Bottleneck;
    uptodate?: Date;
    log?: (text: string) => void;
}) {
  const uptodate = options?.uptodate ? options.uptodate : new Date('2023-11-01');

  let cursor: string | undefined;
  if (options?.start) {
    cursor = options.start;
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
    if (options?.log) options.log(`${doc.did}/${collection} @ ${cursor}`)
    await SyncState.updateOne(
      { _id: 'main' },
      {
        col: collection,
        colCursor: cursor
      }
    );

    let response: ListRecordsSchema | undefined;
    if (options?.limiter) {
      response = await options.limiter.schedule(async () =>
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
              updatedAt: new Date()
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
                cid: record.cid,
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
                updatedAt: new Date()
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

export async function listRepos(params: {
  limit: number;
  cursor?: string | undefined;
}): Promise<ListReposSchema | undefined> {
  const p = new URLSearchParams({
    limit: params.limit.toString(),
    cursor: params.cursor ?? "",
  });

  return fetch(
    `https://bsky.network/xrpc/com.atproto.sync.listRepos?${p}`
  ).then((res) => {
    if (!res.ok) {
      return;
    }
    return res.json() as Promise<ListReposSchema>;
  });
}

type ExportedOp = {
    did: string;
    operation: {
        alsoKnownAs: string[];
    };
    cid: string;
    nullified: boolean;
    createdAt: string;
};

export async function getCreationTimestamp(did: string): Promise<{handle: string, indexedAt: Date | undefined} | undefined> {
  try {
    return fetch(`https://plc.directory/${did}/log/audit`)
        .then((r) => r.json())
        .then((t) => {
            const r = t as unknown as ExportedOp[]
            const dates = r.map((x) => dayjs(x.createdAt));
            const createdAt = dayjs.min(dates);
            const lastAt = dayjs.max(dates);
            const handle = r
                .filter((x) => x.createdAt === lastAt?.toISOString())
                .map((x) => x.operation.alsoKnownAs[0])[0]
                .replace('at://', '');

            return {
                handle: handle,
                indexedAt: createdAt?.toDate()
            };
        });
  } catch (e) {
  }
}

export async function getFirstPost(repo: string) {
    try {
        const p = new URLSearchParams({
            repo: repo,
            collection: 'app.bsky.feed.post',
            reverse: String(true),
            limit: String(1)
        });
        return fetch(`https://bsky.social/xrpc/com.atproto.repo.listRecords?${p}`)
          .then(res => {
            if (!res.ok) return;
            const data = res.json() as Promise<ListRecordsSchema>;
            return data.then(x => {
              if (x.records && x.records.length > 0) {
                const post = x.records[0]
                if (AppBskyFeedPost.isRecord(post.value)) {
                  return {
                    uri: post.uri,
                    cid: post.cid,
                    value: post.value as PostRecord,
                  }
                }
              }
            })
          });
    } catch (e) {}
    return;
}

export async function listRecords(
  pds: string,
  params: {
    repo: string;
    collection: string;
    limit: number;
    cursor: string | undefined;
    reverse: boolean;
  }
): Promise<ListRecordsSchema | undefined> {
  const p = {
    repo: params.repo,
    collection: params.collection,
    limit: params.limit.toString(),
    cursor: params.cursor ?? "",
    reverse: params.reverse.toString(),
  };
  return fetch(
    `${pds}/xrpc/com.atproto.repo.listRecords?${new URLSearchParams(p)}`
  ).then((res) => {
    if (!res.ok) {
      return;
    }
    return res.json() as Promise<ListRecordsSchema>;
  });
}

export async function getProfile(
  did: string
): Promise<ProfileViewDetailed | undefined> {
  return fetch(
    `https://api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`
  ).then((res) => {
    if (!res.ok) {
      return;
    }
    return res.json() as Promise<ProfileViewDetailed>;
  });
}

export async function updateProfile(
  did: string
): Promise<ProfileViewDetailed | undefined> {
  try {
    const profile = await getProfile(did);
    if (!!profile) {
      const query = await Profile.findOne({ _id: did }, "indexedAt");
      if (!!query && !!query.indexedAt) {
        await Profile.updateOne(
          { _id: did },
          {
            handle: profile.handle,
            displayName: profile.displayName,
            avatar: profile.avatar ?? null,
            description: profile.description ?? null,
            labels: profile.labels,
            lastProfileUpdateAt: getDateTime(),
          },
          { upsert: true }
        );
      } else {
        await Profile.updateOne(
          { _id: did },
          {
            handle: profile.handle,
            displayName: profile.displayName,
            avatar: profile.avatar ?? null,
            description: profile.description ?? null,
            labels: profile.labels,
            indexedAt: profile.indexedAt
              ? getDateTime(new Date(profile.indexedAt))
              : null,
            lastProfileUpdateAt: getDateTime(),
          },
          { upsert: true }
        );
      }
      return profile;
    } else {
      return;
    }
  } catch (e: any) {
    if (e.error === "AccountTakedown") {
      await Profile.updateOne(
        { _id: did },
        {
          displayName: "Account has been taken down",
          lastProfileUpdateAt: getDateTime(),
        }
      );
    }
  }
  return;
}

export const updatePartition = async (
  author: string,
  subject: string,
  date: string,
  inc: any,
  push: any
) => {
  try {
    const authorSubjectCheck = await Interaction.exists({
      _id: { author: author, subject: subject },
    });
    if (authorSubjectCheck) {
      const dateCheck = await Interaction.exists({
        _id: { author: author, subject: subject },
        "list._id": date,
      });
      if (dateCheck) {
        await Interaction.updateOne(
          {
            _id: { author: author, subject: subject },
            "list._id": date,
          },
          { $inc: inc }
        );
      } else {
        await Interaction.updateOne(
          {
            _id: { author: author, subject: subject },
          },
          {
            $push: {
              list: push,
            },
          }
        );
      }
    } else {
      await Interaction.updateOne(
        {
          _id: { author: author, subject: subject },
        },
        {
          $push: {
            list: push,
          },
        },
        { upsert: true }
      );
    }
  } catch (e) {
    console.log("###########################################");
    console.log(author);
    console.log(subject);
    console.log(inc);
    console.log(push);
    console.log("###########################################");
  }
};
