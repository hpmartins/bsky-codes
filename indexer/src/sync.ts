var cron = require("node-cron");
import {
  AppBskyEmbedImages,
  AppBskyEmbedRecord,
  AppBskyEmbedRecordWithMedia,
  AppBskyFeedLike,
  AppBskyFeedPost,
  AppBskyFeedRepost,
  AppBskyGraphBlock,
  BskyAgent,
} from "@atproto/api";
import "dotenv/config";
import Bottleneck from "bottleneck";
import { updatePartition } from "./worker";
import {
  Block,
  Interaction,
  Post,
  Profile,
  SyncProfile,
  SyncState,
  connectDb,
} from "../../common";
import { ProfileViewDetailed } from "../../lexicon/types/app/bsky/actor/defs";
import express from "express";

const app = express();

const api = new BskyAgent({
  service: "https://bsky.social",
});

const limiter = new Bottleneck({
  maxConcurrent: 10,
  minTime: (5 * 60000) / 5000,
});

limiter.on("failed", async (error, jobInfo) => {
  console.log(error);
  console.log("Retrying in 10s...");
  return 10000;
});

limiter.on("retry", (error, jobInfo) => console.log("Retrying now"));

const uptodate = new Date("2023-11-01");

let repoIndex: number = 0;
let repoCursor: string | undefined;

async function getRecords(
  repo: string,
  collection: string,
  start?: string | undefined
) {
  let cursor: string | undefined;

  if (!!start) {
    cursor = start;
  }

  await SyncProfile.findByIdAndUpdate(
    repo,
    {
      updated: false,
      status: `updating ${collection}`,
    },
    { upsert: true }
  );

  do {
    console.log(`[sync] [${repoIndex}] ${repo}/${collection} @ ${cursor}`);
    await SyncState.updateOne(
      { _id: "main" },
      {
        col: collection,
        colCursor: cursor,
      }
    );

    const res = await limiter.schedule(async () =>
      api.com.atproto.repo.listRecords({
        repo: repo,
        collection: collection,
        limit: 100,
        cursor: cursor,
        reverse: true,
      })
    );

    if (res.success && res.data.cursor && res.data.records.length > 0) {
      for (const record of res.data.records) {
        if (AppBskyGraphBlock.isRecord(record.value)) {
          await Block.updateOne(
            { _id: record.uri },
            {
              author: repo,
              subject: record.value.subject,
              createdAt: new Date(record.value.createdAt),
              updatedAt: new Date(record.value.createdAt),
            },
            { upsert: true, timestamps: false, strict: false }
          );
        }
        if (AppBskyFeedLike.isRecord(record.value)) {
          if (
            new Date(record.value.createdAt) < uptodate &&
            record.value.subject.uri.includes("app.bsky.feed.post")
          ) {
            const date = new Date(record.value.createdAt).toLocaleDateString(
              "en-CA"
            );
            await updatePartition(
              repo,
              record.value.subject.uri.slice(5, 37),
              date,
              { "list.$.likes": 1 },
              { _id: date, likes: 1 }
            );
          }
        }
        if (AppBskyFeedRepost.isRecord(record.value)) {
          if (
            new Date(record.value.createdAt) < uptodate &&
            record.value.subject.uri.includes("app.bsky.feed.post")
          ) {
            const date = new Date(record.value.createdAt).toLocaleDateString(
              "en-CA"
            );
            await updatePartition(
              repo,
              record.value.subject.uri.slice(5, 37),
              date,
              { "list.$.reposts": 1 },
              { _id: date, reposts: 1 }
            );
          }
        }
        if (AppBskyFeedPost.isRecord(record.value)) {
          if (new Date(record.value.createdAt) < uptodate) {
            const date = new Date(record.value.createdAt).toLocaleDateString(
              "en-CA"
            );

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
                author: repo,
                text: record.value.text,
                replyParent: record.value.reply?.parent.uri ?? null,
                replyRoot: record.value.reply?.root.uri ?? null,
                quoteUri: quoteUri ?? null,
                altText: altText ?? null,
                langs: record.value.langs ?? null,
                hasImages: hasImages,
                textLength: record.value.text.length,
                createdAt: new Date(record.value.createdAt),
                updatedAt: new Date(record.value.createdAt),
              },
              { upsert: true, timestamps: false, strict: false }
            );

            if (!!record.value.reply?.parent.uri.length) {
              const subject = record.value.reply.parent.uri.split("/")[2];
              await updatePartition(
                repo,
                subject,
                date,
                {
                  "list.$.replies": 1,
                  "list.$.characters": record.value.text.length,
                },
                { _id: date, replies: 1, characters: record.value.text.length }
              );
            }

            if (!!quoteUri) {
              const subject = quoteUri.split("/")[2];
              await updatePartition(
                repo,
                subject,
                date,
                {
                  "list.$.replies": 1,
                  "list.$.characters": record.value.text.length,
                },
                { _id: date, replies: 1, characters: record.value.text.length }
              );
            }
          }
        }
      }
    }
    cursor = res.data.cursor ?? undefined;
  } while (!!cursor && cursor.length > 0);
}

cron.schedule("*/2 * * * *", async () => {
  await syncWaitingProfiles();
});

async function syncWaitingProfiles() {
  const list = await SyncProfile.find(
    {
      updated: false,
      status: null,
    },
    {},
    { limit: 1 }
  ).sort({ updatedAt: 1 });
  for (const user of list) {
    await syncOneProfile(user._id);
  }
}

async function syncOneProfile(did: string) {
  const pRes = await limiter.schedule(async () =>
    api.getProfile({ actor: did })
  );
  if (!pRes.success) return false;

  const profile = pRes.data as ProfileViewDetailed;
  await Profile.updateOne(
    { _id: profile.did },
    {
      handle: profile.handle,
      displayName: profile.displayName,
      avatar: profile.avatar,
      description: profile.description,
      indexedAt: profile.indexedAt,
      lastProfileUpdateAt: new Date(),
    },
    { upsert: true }
  );

  console.log(`[sync] Updating data of @${profile.handle} [${profile.did}]`);

  await Interaction.updateMany(
    { "_id.author": did },
    { $pull: { list: { _id: { $lt: uptodate } } } }
  );

  await getRecords(did, "app.bsky.graph.block");
  await getRecords(did, "app.bsky.feed.like");
  await getRecords(did, "app.bsky.feed.repost");
  await getRecords(did, "app.bsky.feed.post");

  await SyncProfile.findByIdAndUpdate(did, {
    updated: true,
    status: "synced",
  });
  console.log(`Updated profile of @${profile.handle} [${profile.did}]`);

  return true;
}

async function main() {
  await connectDb();
  await api.login({
    identifier: process.env.APP_BSKY_IDENTIFIER ?? "",
    password: process.env.APP_BSKY_PASSWORD ?? "",
  });

  app.get("/update/:did", async (req, res) => {
    const couldUpdate = await syncOneProfile(req.params.did);
    if (!couldUpdate) {
      return res.send("could not find did");
    }
    return res.send("done!");
  });

  app.listen(6789, () => {
    console.log("listening");
  });

  // Backfilling
  const syncState = await SyncState.findById("main");
  let collection: string | undefined;
  let collectionCursor: string | undefined;
  if (!!syncState) {
    repoCursor = syncState.repoCursor ?? undefined;
    collection = syncState.col ?? undefined;
    collectionCursor = syncState.colCursor ?? undefined;
  }

  do {
    const repoRes = await limiter.schedule(async () =>
      api.com.atproto.sync.listRepos({
        limit: 200,
        cursor: repoCursor,
      })
    );
    repoIndex = 0;

    if (repoRes.success && repoRes.data.repos.length > 0) {
      for (const [idx, repo] of repoRes.data.repos.entries()) {
        if (
          syncState &&
          repoCursor === syncState.repoCursor &&
          idx < syncState.repoIndex
        ) {
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
              status: "updating",
            },
            { upsert: true }
          );
        }

        const profileExists = await Profile.exists({ _id: repo.did });
        if (!profileExists) {
          const pRes = await limiter.schedule(async () =>
            api.getProfile({ actor: repo.did })
          );
          if (pRes.success) {
            const profile = pRes.data as ProfileViewDetailed;
            console.log(profile);
            await Profile.create({
              _id: profile.did,
              handle: profile.handle,
              displayName: profile.displayName,
              avatar: profile.avatar,
              description: profile.description,
              indexedAt: profile.indexedAt,
              lastProfileUpdateAt: new Date(),
            });
          }
        }

        await SyncState.updateOne(
          { _id: "main" },
          {
            repoCursor: repoCursor,
            repoIndex: idx,
            repoDid: repo.did,
          },
          { upsert: true }
        );

        if (!collection) {
          await getRecords(repo.did, "app.bsky.graph.block");
          await getRecords(repo.did, "app.bsky.feed.like");
          await getRecords(repo.did, "app.bsky.feed.repost");
          await getRecords(repo.did, "app.bsky.feed.post");
        } else {
          if (collection === "app.bsky.graph.block") {
            await getRecords(
              repo.did,
              "app.bsky.graph.block",
              collectionCursor
            );
            await getRecords(repo.did, "app.bsky.feed.like", collectionCursor);
            await getRecords(
              repo.did,
              "app.bsky.feed.repost",
              collectionCursor
            );
            await getRecords(repo.did, "app.bsky.feed.post", collectionCursor);
          } else if (collection === "app.bsky.feed.like") {
            await getRecords(repo.did, "app.bsky.feed.like", collectionCursor);
            await getRecords(
              repo.did,
              "app.bsky.feed.repost",
              collectionCursor
            );
            await getRecords(repo.did, "app.bsky.feed.post", collectionCursor);
          } else if (collection === "app.bsky.feed.repost") {
            await getRecords(
              repo.did,
              "app.bsky.feed.repost",
              collectionCursor
            );
            await getRecords(repo.did, "app.bsky.feed.post", collectionCursor);
          } else if (collection === "app.bsky.feed.post") {
            await getRecords(repo.did, "app.bsky.feed.post", collectionCursor);
          }
          collection = undefined;
          collectionCursor = undefined;
        }

        await SyncProfile.findByIdAndUpdate(repo.did, {
          updated: true,
          status: "backfilled",
        });

        repoIndex++;
      }
    }
    repoCursor = repoRes.data.cursor ?? undefined;
  } while (!!repoCursor && repoCursor.length > 0);
}

main();
